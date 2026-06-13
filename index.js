import { buildJsonPluginConfigSchema, definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createChannelPluginBase } from "openclaw/plugin-sdk/channel-core";
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
  },
};

export const potassiumKchatChannelPlugin = createChannelPluginBase({
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

      return {
        ...config,
        channels: {
          ...channels,
          [KCHAT_CHANNEL_ID]: {
            ...channelConfig,
            enabled: true,
            ...(name ? { name } : {}),
            ...(tokenEnvName ? { tokenEnvName } : {}),
          },
        },
      };
    },
  },
});

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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
