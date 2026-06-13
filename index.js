import { buildJsonPluginConfigSchema, definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createChannelPluginBase } from "openclaw/plugin-sdk/channel-core";
import { createMessageReceiptFromOutboundResults, defineChannelMessageAdapter } from "openclaw/plugin-sdk/channel-outbound";
import { createInfomaniakClient } from "liquid-potassium";
import { createInfomaniakOpenClawTools, InfomaniakPluginConfigJsonSchema, resolveInfomaniakPluginConfig } from "liquid-potassium/openclaw/tools";

const DEFAULT_INFOMANIAK_TOKEN_ENV_NAME = "INFOMANIAK_TOKEN";
const KCHAT_CHANNEL_ID = "kchat";

export const PotassiumPluginConfigJsonSchema = withoutDirectTokenConfig(InfomaniakPluginConfigJsonSchema);
export const PotassiumKchatChannelConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      description: "Optional display name for this Infomaniak kChat channel account.",
    },
    enabled: {
      type: "boolean",
      description: "Whether the Infomaniak kChat channel scaffold is enabled.",
    },
    tokenEnvName: {
      type: "string",
      default: DEFAULT_INFOMANIAK_TOKEN_ENV_NAME,
      description: "Environment variable name used for the Infomaniak API bearer token.",
    },
    teamName: {
      type: "string",
      description: "Default kChat team name used when resolving channel names.",
    },
    defaultChannel: {
      type: "string",
      description: "Default kChat destination. Supports id:<channel_id>, #channel, channel, or team/channel.",
    },
    setOnline: {
      type: "boolean",
      description: "Whether kChat should set the authenticated user online when creating posts.",
    },
  },
};

export const potassiumKchatMessageAdapter = createPotassiumKchatMessageAdapter();

export const potassiumKchatChannelPlugin = {
  ...createChannelPluginBase({
    id: KCHAT_CHANNEL_ID,
    meta: {
      label: "Infomaniak kChat",
      selectionLabel: "Infomaniak kChat",
      docsPath: "/channels/kchat",
      docsLabel: "kChat",
      blurb: "Infomaniak kChat channel scaffold backed by the Potassium Infomaniak SDK.",
      markdownCapable: true,
    },
    capabilities: {
      chatTypes: ["direct", "group", "channel", "thread"],
    },
    configSchema: PotassiumKchatChannelConfigJsonSchema,
    config: {
      listAccountIds(cfg) {
        return hasKchatChannelConfig(cfg) ? ["default"] : [];
      },
      defaultAccountId() {
        return "default";
      },
      resolveAccount(cfg, accountId) {
        return resolveKchatAccount(cfg, accountId);
      },
      inspectAccount(cfg, accountId) {
        const account = resolveKchatAccount(cfg, accountId);
        return {
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: account.configured,
        };
      },
      isEnabled(account) {
        return account.enabled;
      },
      isConfigured(account) {
        return account.configured;
      },
      unconfiguredReason(account) {
        return `Set ${account.tokenEnvName} in the environment before enabling kChat delivery.`;
      },
      describeAccount(account) {
        return {
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: account.configured,
          statusState: account.configured ? "configured" : "not configured",
        };
      },
      hasConfiguredState({ cfg, env }) {
        const channelConfig = resolveKchatChannelConfig(cfg);
        const tokenEnvName = resolveKchatTokenEnvName(channelConfig);
        return hasNonEmptyEnvValue(env, tokenEnvName);
      },
    },
    setup: {
      applyAccountConfig({ cfg, input }) {
        const config = isRecord(cfg) ? cfg : {};
        const channels = isRecord(config.channels) ? config.channels : {};
        const channelConfig = resolveKchatChannelConfig(config);
        const inputRecord = isRecord(input) ? input : {};
        const name = readOptionalString(inputRecord.name);
        const tokenEnvName = readOptionalString(inputRecord.tokenEnvName);
        const teamName = readOptionalString(inputRecord.teamName);
        const defaultChannel = readOptionalString(inputRecord.defaultChannel);
        const setOnline = readOptionalBoolean(inputRecord.setOnline);

        return {
          ...config,
          channels: {
            ...channels,
            [KCHAT_CHANNEL_ID]: {
              ...channelConfig,
              enabled: true,
              ...(name ? { name } : {}),
              ...(tokenEnvName ? { tokenEnvName } : {}),
              ...(teamName ? { teamName } : {}),
              ...(defaultChannel ? { defaultChannel } : {}),
              ...(setOnline === undefined ? {} : { setOnline }),
            },
          },
        };
      },
    },
  }),
  message: potassiumKchatMessageAdapter,
  outbound: {
    deliveryMode: "direct",
    deliveryCapabilities: {
      durableFinal: {
        text: true,
        replyTo: true,
        thread: true,
      },
    },
    resolveTarget({ cfg, to }) {
      try {
        const destination = resolveKchatDestinationTarget({ cfg, to });
        return { ok: true, to: destination };
      } catch (error) {
        return { ok: false, error };
      }
    },
    sendText(ctx) {
      return sendKchatText(ctx).then(({ deliveryResult }) => deliveryResult);
    },
  },
};

const potassiumOpenClawPlugin = definePluginEntry({
  id: "potassium",
  name: "Potassium",
  description: "Infomaniak OpenClaw tools backed by the liquid-potassium Node SDK.",
  configSchema: buildJsonPluginConfigSchema(PotassiumPluginConfigJsonSchema),
  register(api) {
    const config = resolvePotassiumPluginConfig(api.pluginConfig);
    api.registerChannel?.({ plugin: potassiumKchatChannelPlugin });
    for (const tool of createInfomaniakOpenClawTools({ config, fetch: globalThis.fetch })) {
      api.registerTool(tool);
    }
  },
});

export default potassiumOpenClawPlugin;

export function resolvePotassiumPluginConfig(pluginConfig) {
  assertNoDirectTokenConfig(pluginConfig);
  return resolveInfomaniakPluginConfig(pluginConfig);
}

export function createPotassiumKchatMessageAdapter(options = {}) {
  return defineChannelMessageAdapter({
    id: KCHAT_CHANNEL_ID,
    durableFinal: {
      capabilities: {
        text: true,
        replyTo: true,
        thread: true,
      },
    },
    send: {
      text: async (ctx) => {
        const { receipt, messageId, providerResult } = await sendKchatText(ctx, options);
        return {
          receipt,
          ...(messageId ? { messageId } : {}),
          providerResult,
        };
      },
    },
  });
}

export async function sendKchatText(ctx, options = {}) {
  const destination = await resolveKchatDestination({
    cfg: ctx.cfg,
    to: ctx.to,
    client: options.client,
    createClient: options.createClient,
    fetch: options.fetch,
    signal: ctx.signal,
  });
  const channelConfig = resolveKchatChannelConfig(ctx.cfg);
  const client = destination.client ?? resolveKchatClient({
    channelConfig,
    client: options.client,
    createClient: options.createClient,
    fetch: options.fetch,
  });
  const rootId = resolveKchatRootId(ctx);
  const body = {
    channel_id: destination.channelId,
    message: String(ctx.text ?? ""),
    ...(rootId ? { root_id: rootId } : {}),
  };
  const query = resolveKchatSetOnlineQuery(channelConfig);
  const providerResult = await client.kchat.createpost({
    body,
    ...(query ? { query } : {}),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  const messageId = resolveProviderPostId(providerResult);
  const deliveryResult = {
    channel: KCHAT_CHANNEL_ID,
    messageId: messageId ?? "",
    channelId: destination.channelId,
    conversationId: destination.conversationId,
    timestamp: resolveProviderTimestamp(providerResult),
    meta: {
      rawProviderResult: providerResult,
    },
  };
  const receipt = createMessageReceiptFromOutboundResults({
    results: [deliveryResult],
    kind: "text",
    threadId: ctx.threadId == null ? undefined : String(ctx.threadId),
    replyToId: ctx.replyToId ?? undefined,
  });

  return {
    deliveryResult: {
      ...deliveryResult,
      receipt,
    },
    receipt,
    ...(messageId ? { messageId } : {}),
    providerResult,
  };
}

function withoutDirectTokenConfig(schema) {
  const properties = {};
  for (const [key, propertySchema] of Object.entries(schema.properties)) {
    if (key === "token") {
      continue;
    }
    properties[key] =
      key === "tokenEnvName"
        ? {
            ...propertySchema,
            description: "Environment variable name used for the Infomaniak API bearer token.",
          }
        : propertySchema;
  }

  return {
    ...schema,
    properties,
  };
}

function assertNoDirectTokenConfig(pluginConfig) {
  if (isRecord(pluginConfig) && Object.hasOwn(pluginConfig, "token")) {
    throw new Error("Direct Infomaniak token config is disabled. Use INFOMANIAK_TOKEN or configure tokenEnvName.");
  }
}

function resolveKchatAccount(cfg, accountId) {
  const channelConfig = resolveKchatChannelConfig(cfg);
  const resolvedAccountId = readOptionalString(accountId) ?? "default";

  return {
    accountId: resolvedAccountId,
    name: readOptionalString(channelConfig.name) ?? "Infomaniak kChat",
    tokenEnvName: resolveKchatTokenEnvName(channelConfig),
    enabled: channelConfig.enabled !== false,
    configured: hasKchatChannelConfig(cfg),
  };
}

function hasKchatChannelConfig(cfg) {
  return (
    isRecord(cfg) &&
    isRecord(cfg.channels) &&
    Object.hasOwn(cfg.channels, KCHAT_CHANNEL_ID) &&
    isRecord(cfg.channels[KCHAT_CHANNEL_ID])
  );
}

function resolveKchatChannelConfig(cfg) {
  if (!isRecord(cfg) || !isRecord(cfg.channels)) {
    return {};
  }

  const channelConfig = cfg.channels[KCHAT_CHANNEL_ID];
  return isRecord(channelConfig) ? channelConfig : {};
}

function resolveKchatTokenEnvName(channelConfig) {
  return readOptionalString(channelConfig.tokenEnvName) ?? DEFAULT_INFOMANIAK_TOKEN_ENV_NAME;
}

function resolveKchatDestinationTarget({ cfg, to }) {
  const channelConfig = resolveKchatChannelConfig(cfg);
  const target = readOptionalString(to) ?? readOptionalString(channelConfig.defaultChannel);

  if (!target) {
    throw new Error("kChat destination is required. Provide a target or configure channels.kchat.defaultChannel.");
  }

  return target;
}

async function resolveKchatDestination({ cfg, to, client, createClient, fetch, signal }) {
  const channelConfig = resolveKchatChannelConfig(cfg);
  const rawDestination = resolveKchatDestinationTarget({ cfg, to });
  const idDestination = parseKchatChannelIdDestination(rawDestination);
  if (idDestination) {
    return idDestination;
  }

  const namedDestination = parseKchatNamedDestination(rawDestination, channelConfig);
  if (!namedDestination.teamName) {
    throw new Error(
      "kChat teamName is required to resolve channel names. Configure channels.kchat.teamName or use team/channel.",
    );
  }

  const resolvedClient = resolveKchatClient({
    channelConfig,
    client,
    createClient,
    fetch,
  });
  const channel = await resolvedClient.kchat.getchannelbynameforteamname({
    path: {
      team_name: namedDestination.teamName,
      channel_name: namedDestination.channelName,
    },
    ...(signal ? { signal } : {}),
  });
  const channelId = resolveProviderChannelId(channel);

  if (!channelId) {
    throw new Error(`kChat channel lookup did not return an id for ${namedDestination.teamName}/${namedDestination.channelName}.`);
  }

  return {
    channelId,
    conversationId: `${namedDestination.teamName}/${namedDestination.channelName}`,
    client: resolvedClient,
  };
}

function parseKchatChannelIdDestination(destination) {
  if (!destination.startsWith("id:")) {
    return undefined;
  }

  const channelId = readOptionalString(destination.slice("id:".length));
  if (!channelId) {
    throw new Error("kChat id: destination must include a channel_id.");
  }

  return {
    channelId,
    conversationId: `id:${channelId}`,
  };
}

function parseKchatNamedDestination(destination, channelConfig) {
  const parts = destination.split("/");
  const configuredTeamName = readOptionalString(channelConfig.teamName);

  if (parts.length >= 2) {
    const teamName = readOptionalString(parts[0]);
    const channelName = normalizeKchatChannelName(parts.slice(1).join("/"));

    if (!teamName || !channelName) {
      throw new Error("kChat team/channel destination must include both team and channel names.");
    }

    return { teamName, channelName };
  }

  const channelName = normalizeKchatChannelName(destination);
  if (!channelName) {
    throw new Error("kChat channel destination cannot be empty.");
  }

  return {
    teamName: configuredTeamName,
    channelName,
  };
}

function normalizeKchatChannelName(value) {
  const normalized = readOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  return readOptionalString(normalized.startsWith("#") ? normalized.slice(1) : normalized);
}

function resolveKchatClient({ channelConfig, client, createClient, fetch }) {
  if (client) {
    return client;
  }

  const tokenEnvName = resolveKchatTokenEnvName(channelConfig);
  const token = readOptionalString(globalThis.process?.env?.[tokenEnvName]);
  if (!token) {
    throw new Error(`Set ${tokenEnvName} in the environment before sending kChat messages.`);
  }

  const clientFactory = createClient ?? createInfomaniakClient;
  return clientFactory({
    token,
    fetch: fetch ?? globalThis.fetch,
  });
}

function resolveKchatRootId(ctx) {
  if (ctx.threadId !== undefined && ctx.threadId !== null) {
    return readOptionalString(String(ctx.threadId));
  }

  return readOptionalString(ctx.replyToId);
}

function resolveKchatSetOnlineQuery(channelConfig) {
  const setOnline = readOptionalBoolean(channelConfig.setOnline);
  return setOnline === undefined ? undefined : { set_online: setOnline };
}

function resolveProviderChannelId(value) {
  const record = unwrapProviderRecord(value);
  return readOptionalString(record?.id) ?? readOptionalString(record?.channel_id);
}

function resolveProviderPostId(value) {
  const record = unwrapProviderRecord(value);
  return readOptionalString(record?.id) ?? readOptionalString(record?.post_id);
}

function resolveProviderTimestamp(value) {
  const record = unwrapProviderRecord(value);
  return typeof record?.create_at === "number" ? record.create_at : undefined;
}

function unwrapProviderRecord(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  if (isRecord(value.data)) {
    return value.data;
  }

  return value;
}

function hasNonEmptyEnvValue(env, name) {
  return isRecord(env) && readOptionalString(env[name]) !== undefined;
}

function readOptionalString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readOptionalBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
