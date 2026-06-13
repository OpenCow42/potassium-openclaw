import { buildJsonPluginConfigSchema, definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createChannelPluginBase } from "openclaw/plugin-sdk/channel-core";
import { createMessageReceiptFromOutboundResults, defineChannelMessageAdapter } from "openclaw/plugin-sdk/channel-outbound";
import { isRequestBodyLimitError, readRequestBodyWithLimit, requestBodyErrorToText } from "openclaw/plugin-sdk/webhook-ingress";
import { createInfomaniakClient } from "liquid-potassium";
import { createInfomaniakOpenClawTools, InfomaniakPluginConfigJsonSchema, resolveInfomaniakPluginConfig } from "liquid-potassium/openclaw/tools";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_INFOMANIAK_TOKEN_ENV_NAME = "INFOMANIAK_TOKEN";
const DEFAULT_KCHAT_OUTGOING_WEBHOOK_TOKEN_ENV_NAME = "INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN";
const DEFAULT_KCHAT_WEBHOOK_PATH = "/channels/kchat/webhook";
const KCHAT_WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;
const KCHAT_WEBHOOK_BODY_TIMEOUT_MS = 5000;
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
    webhookPath: {
      type: "string",
      default: DEFAULT_KCHAT_WEBHOOK_PATH,
      description: "Gateway HTTP path that receives kChat outgoing webhook events.",
    },
    outgoingWebhookTokenEnvName: {
      type: "string",
      default: DEFAULT_KCHAT_OUTGOING_WEBHOOK_TOKEN_ENV_NAME,
      description: "Environment variable name used for the kChat outgoing webhook verification token.",
    },
    ignoredUserIds: {
      type: "array",
      items: {
        type: "string",
      },
      description: "kChat user IDs to ignore for inbound webhook events, typically the API posting account.",
    },
    ignoredUserNames: {
      type: "array",
      items: {
        type: "string",
      },
      description: "kChat usernames to ignore for inbound webhook events, typically the API posting account.",
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
        const webhookPath = readOptionalString(inputRecord.webhookPath);
        const outgoingWebhookTokenEnvName = readOptionalString(inputRecord.outgoingWebhookTokenEnvName);
        const ignoredUserIds = readOptionalStringArray(inputRecord.ignoredUserIds);
        const ignoredUserNames = readOptionalStringArray(inputRecord.ignoredUserNames);

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
              ...(webhookPath ? { webhookPath } : {}),
              ...(outgoingWebhookTokenEnvName ? { outgoingWebhookTokenEnvName } : {}),
              ...(ignoredUserIds ? { ignoredUserIds } : {}),
              ...(ignoredUserNames ? { ignoredUserNames } : {}),
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
    registerPotassiumKchatWebhookRoute(api);
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

export function createPotassiumKchatWebhookHandler(options = {}) {
  return async (req, res) => {
    if (req.method !== "POST") {
      respondJson(res, 405, { ok: false, error: "method_not_allowed" });
      return true;
    }

    const channelConfig = options.channelConfig ?? resolveKchatChannelConfig(options.cfg);
    const tokenEnvName = resolveKchatOutgoingWebhookTokenEnvName(channelConfig);
    const expectedToken = readOptionalString((options.env ?? globalThis.process?.env)?.[tokenEnvName]);

    if (!expectedToken) {
      respondJson(res, 503, { ok: false, error: "webhook_token_unconfigured", tokenEnvName });
      return true;
    }

    let payload;
    try {
      payload = await readKchatWebhookPayload(req);
    } catch (error) {
      if (isRequestBodyLimitError(error)) {
        respondJson(res, error.statusCode, { ok: false, error: requestBodyErrorToText(error.code) });
        return true;
      }

      respondJson(res, 400, { ok: false, error: "invalid_payload" });
      return true;
    }

    const receivedToken = readOptionalString(payload.token);
    if (!receivedToken || !safeEqualSecret(receivedToken, expectedToken)) {
      respondJson(res, 401, { ok: false, error: "invalid_token" });
      return true;
    }

    if (shouldIgnoreKchatWebhookPayload(payload, channelConfig)) {
      respondJson(res, 200, { ok: true, status: "dropped" });
      return true;
    }

    const inbound = normalizeKchatOutgoingWebhookPayload(payload);
    if (!inbound) {
      respondJson(res, 400, { ok: false, error: "invalid_kchat_payload" });
      return true;
    }

    try {
      await dispatchKchatInboundWebhookEvent({
        cfg: options.cfg,
        channelConfig,
        runtime: options.runtime,
        inbound,
      });
    } catch (error) {
      options.log?.error?.(`kChat webhook dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
      respondJson(res, 500, { ok: false, error: "dispatch_failed" });
      return true;
    }

    respondJson(res, 200, { ok: true, status: "dispatched" });
    return true;
  };
}

export async function readKchatWebhookPayload(req) {
  const body = await readRequestBodyWithLimit(req, {
    maxBytes: KCHAT_WEBHOOK_BODY_LIMIT_BYTES,
    timeoutMs: KCHAT_WEBHOOK_BODY_TIMEOUT_MS,
  });

  return parseKchatWebhookBody(body, headerValue(req.headers?.["content-type"]));
}

export function parseKchatWebhookBody(body, contentType = "") {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) {
    return {};
  }

  if (contentType.toLowerCase().includes("application/json")) {
    return normalizeParsedKchatPayload(JSON.parse(trimmed));
  }

  const form = Object.fromEntries(new URLSearchParams(trimmed).entries());
  return normalizeParsedKchatPayload(form);
}

export function normalizeKchatOutgoingWebhookPayload(payload) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const rawText = readOptionalString(payload.text);
  const channelId = readOptionalString(payload.channel_id) ?? readOptionalString(payload.channelId);
  const channelName = readOptionalString(payload.channel_name) ?? readOptionalString(payload.channelName);
  const teamDomain = readOptionalString(payload.team_domain) ?? readOptionalString(payload.teamDomain);
  const teamId = readOptionalString(payload.team_id) ?? readOptionalString(payload.teamId);
  const postId = readOptionalString(payload.post_id) ?? readOptionalString(payload.postId) ?? readOptionalString(payload.id);
  const rootId = readOptionalString(payload.root_id) ?? readOptionalString(payload.rootId);
  const conversationId = channelId ?? formatKchatTeamChannel(teamDomain, channelName) ?? channelName;

  if (!rawText || !conversationId) {
    return undefined;
  }

  const timestamp = resolveKchatWebhookTimestamp(payload);
  const messageId = postId ?? `${conversationId}:${timestamp ?? Date.now()}`;
  const senderId = readOptionalString(payload.user_id) ?? readOptionalString(payload.userId);
  const senderName = readOptionalString(payload.user_name) ?? readOptionalString(payload.userName);

  return {
    id: messageId,
    postId,
    rootId,
    timestamp,
    rawText,
    textForAgent: rawText,
    textForCommands: rawText,
    channelId,
    channelName,
    teamDomain,
    teamId,
    conversationId,
    conversationLabel: formatKchatTeamChannel(teamDomain, channelName) ?? channelName ?? channelId,
    sender: {
      ...(senderId ? { id: senderId } : {}),
      ...(senderName ? { username: senderName, name: senderName } : {}),
    },
    raw: redactKchatWebhookPayload(payload),
  };
}

export async function dispatchKchatInboundWebhookEvent({ cfg, channelConfig, runtime, inbound }) {
  const channelRuntime = runtime?.channel;
  if (!channelRuntime?.inbound?.run) {
    throw new Error("OpenClaw channel inbound runtime is unavailable.");
  }

  const accountId = "default";
  await channelRuntime.inbound.run({
    channel: KCHAT_CHANNEL_ID,
    accountId,
    raw: inbound.raw,
    adapter: {
      ingest: () => ({
        id: inbound.id,
        ...(inbound.timestamp === undefined ? {} : { timestamp: inbound.timestamp }),
        rawText: inbound.rawText,
        textForAgent: inbound.textForAgent,
        textForCommands: inbound.textForCommands,
        raw: inbound.raw,
      }),
      resolveTurn: (input) => {
        const peer = {
          kind: "channel",
          id: inbound.conversationId,
        };
        const route = channelRuntime.routing?.resolveAgentRoute({
          cfg,
          channel: KCHAT_CHANNEL_ID,
          accountId,
          peer,
          ...(inbound.teamId || inbound.teamDomain ? { teamId: inbound.teamId ?? inbound.teamDomain } : {}),
        });
        if (!route) {
          throw new Error("OpenClaw channel route resolution is unavailable.");
        }

        const replyTo = resolveKchatInboundReplyTo(inbound, channelConfig);
        const ctxPayload = channelRuntime.inbound.buildContext({
          channel: KCHAT_CHANNEL_ID,
          accountId,
          messageId: inbound.postId ?? input.id,
          timestamp: input.timestamp,
          from: formatKchatInboundFrom(inbound),
          sender: inbound.sender,
          conversation: {
            kind: "channel",
            id: inbound.conversationId,
            ...(inbound.conversationLabel ? { label: inbound.conversationLabel } : {}),
            ...(inbound.rootId ? { threadId: inbound.rootId } : {}),
            ...(inbound.channelId ? { nativeChannelId: inbound.channelId } : {}),
            routePeer: peer,
          },
          route: {
            agentId: route.agentId,
            accountId: route.accountId,
            routeSessionKey: route.sessionKey,
            dispatchSessionKey: route.sessionKey,
            mainSessionKey: route.mainSessionKey,
          },
          reply: {
            to: replyTo,
            ...(inbound.channelId ? { nativeChannelId: inbound.channelId } : {}),
            ...(inbound.rootId ? { messageThreadId: inbound.rootId } : {}),
            ...(!inbound.rootId && inbound.postId ? { replyToId: inbound.postId } : {}),
            sourceReplyDeliveryMode: "thread",
          },
          message: {
            rawBody: input.rawText,
            body: input.rawText,
            bodyForAgent: input.textForAgent,
            commandBody: input.textForCommands,
            inboundEventKind: "user_request",
          },
          extra: {
            kchat: inbound.raw,
          },
        });

        return {
          cfg,
          channel: KCHAT_CHANNEL_ID,
          accountId: route.accountId,
          agentId: route.agentId,
          routeSessionKey: route.sessionKey,
          storePath: channelRuntime.session.resolveStorePath(cfg?.session?.store, { agentId: route.agentId }),
          ctxPayload,
          recordInboundSession: channelRuntime.session.recordInboundSession,
          dispatchReplyWithBufferedBlockDispatcher: channelRuntime.reply.dispatchReplyWithBufferedBlockDispatcher,
          delivery: {
            durable: () => ({
              to: replyTo,
              ...(inbound.rootId ? { threadId: inbound.rootId } : {}),
              ...(!inbound.rootId && inbound.postId ? { replyToId: inbound.postId } : {}),
              requiredCapabilities: { text: true, replyTo: true, thread: true },
            }),
            deliver: async (payload) => {
              const text = readOptionalString(payload.text) ?? readOptionalString(payload.body);
              if (!text) {
                return { visibleReplySent: false };
              }

              const result = await sendKchatText({
                cfg,
                to: replyTo,
                text,
                ...(inbound.rootId ? { threadId: inbound.rootId } : {}),
                ...(!inbound.rootId && inbound.postId ? { replyToId: inbound.postId } : {}),
              });
              return {
                visibleReplySent: true,
                messageIds: result.messageId ? [result.messageId] : [],
                receipt: result.receipt,
                ...(inbound.rootId ? { threadId: inbound.rootId } : {}),
                ...(!inbound.rootId && inbound.postId ? { replyToId: inbound.postId } : {}),
              };
            },
          },
          messageId: inbound.id,
          record: {
            updateLastRoute: {
              sessionKey: route.sessionKey,
              channel: KCHAT_CHANNEL_ID,
              to: replyTo,
              accountId: route.accountId,
              ...(inbound.rootId ? { threadId: inbound.rootId } : {}),
            },
          },
        };
      },
    },
  });
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

function registerPotassiumKchatWebhookRoute(api) {
  if (!api.registerHttpRoute || !hasKchatChannelConfig(api.config)) {
    return;
  }

  const channelConfig = resolveKchatChannelConfig(api.config);
  if (channelConfig.enabled === false) {
    return;
  }

  api.registerHttpRoute({
    path: resolveKchatWebhookPath(channelConfig),
    auth: "plugin",
    match: "exact",
    replaceExisting: true,
    handler: createPotassiumKchatWebhookHandler({
      cfg: api.config,
      channelConfig,
      runtime: api.runtime,
      log: api.logger,
    }),
  });
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

function resolveKchatOutgoingWebhookTokenEnvName(channelConfig) {
  return readOptionalString(channelConfig.outgoingWebhookTokenEnvName) ?? DEFAULT_KCHAT_OUTGOING_WEBHOOK_TOKEN_ENV_NAME;
}

function resolveKchatWebhookPath(channelConfig) {
  const webhookPath = readOptionalString(channelConfig.webhookPath) ?? DEFAULT_KCHAT_WEBHOOK_PATH;
  return webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`;
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

function normalizeParsedKchatPayload(parsed) {
  if (!isRecord(parsed)) {
    throw new Error("kChat webhook payload must be an object.");
  }

  const nestedPayload = parsed.payload;
  if (isRecord(nestedPayload)) {
    return nestedPayload;
  }

  if (typeof nestedPayload === "string") {
    const trimmed = nestedPayload.trim();
    if (!trimmed) {
      return {};
    }

    if (trimmed.startsWith("{")) {
      const nestedJson = JSON.parse(trimmed);
      if (!isRecord(nestedJson)) {
        throw new Error("kChat nested webhook payload must be an object.");
      }
      return nestedJson;
    }

    return Object.fromEntries(new URLSearchParams(trimmed).entries());
  }

  return parsed;
}

function shouldIgnoreKchatWebhookPayload(payload, channelConfig) {
  const ignoredUserIds = readOptionalStringArray(channelConfig.ignoredUserIds) ?? [];
  const ignoredUserNames = readOptionalStringArray(channelConfig.ignoredUserNames) ?? [];
  const userId = readOptionalString(payload.user_id) ?? readOptionalString(payload.userId);
  const userName = readOptionalString(payload.user_name) ?? readOptionalString(payload.userName);

  return Boolean((userId && ignoredUserIds.includes(userId)) || (userName && ignoredUserNames.includes(userName)));
}

function resolveKchatWebhookTimestamp(payload) {
  const value =
    readOptionalNumber(payload.timestamp) ??
    readOptionalNumber(payload.create_at) ??
    readOptionalNumber(payload.createAt);

  if (value === undefined) {
    return undefined;
  }

  return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
}

function resolveKchatInboundReplyTo(inbound, channelConfig) {
  if (inbound.channelId) {
    return `id:${inbound.channelId}`;
  }

  if (inbound.teamDomain && inbound.channelName) {
    return `${inbound.teamDomain}/${inbound.channelName}`;
  }

  if (inbound.channelName) {
    const configuredTeamName = readOptionalString(channelConfig.teamName);
    return configuredTeamName ? `${configuredTeamName}/${inbound.channelName}` : `#${inbound.channelName}`;
  }

  throw new Error("kChat inbound payload did not include a reply channel.");
}

function formatKchatInboundFrom(inbound) {
  const sender = inbound.sender.username ?? inbound.sender.id ?? "unknown";
  return `kchat:${sender}`;
}

function formatKchatTeamChannel(teamName, channelName) {
  if (!teamName || !channelName) {
    return undefined;
  }

  return `${teamName}/${channelName}`;
}

function redactKchatWebhookPayload(payload) {
  const redacted = { ...payload };
  if (Object.hasOwn(redacted, "token")) {
    redacted.token = "[redacted]";
  }
  return redacted;
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

function safeEqualSecret(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function respondJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] : typeof value === "string" ? value : "";
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

function readOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readOptionalStringArray(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.map((entry) => readOptionalString(entry)).filter(Boolean);
  return strings.length > 0 ? strings : undefined;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
