import { buildJsonPluginConfigSchema, definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createChannelPluginBase } from "openclaw/plugin-sdk/channel-core";
import { createMessageReceiptFromOutboundResults, defineChannelMessageAdapter } from "openclaw/plugin-sdk/channel-outbound";
import { resolveThreadSessionKeys } from "openclaw/plugin-sdk/routing";
import { isRequestBodyLimitError, readRequestBodyWithLimit, requestBodyErrorToText } from "openclaw/plugin-sdk/webhook-ingress";
import {
  createInfomaniakClient,
  createKchatMattermostAuthFrame as createLiquidKchatMattermostAuthFrame,
  normalizeKchatWebSocketPostEvent as normalizeLiquidKchatWebSocketPostEvent,
  resolveKchatWebSocketUrl as resolveLiquidKchatWebSocketUrl,
  runKchatWebSocketConnection as runLiquidKchatWebSocketConnection,
} from "liquid-potassium";
import { createInfomaniakOpenClawTools, InfomaniakPluginConfigJsonSchema, resolveInfomaniakPluginConfig } from "liquid-potassium/openclaw/tools";
import { timingSafeEqual } from "node:crypto";

const DEFAULT_INFOMANIAK_TOKEN_ENV_NAME = "INFOMANIAK_TOKEN";
const DEFAULT_KCHAT_OUTGOING_WEBHOOK_TOKEN_ENV_NAME = "INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN";
const DEFAULT_KCHAT_WEBHOOK_PATH = "/channels/kchat/webhook";
const KCHAT_WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;
const KCHAT_WEBHOOK_BODY_TIMEOUT_MS = 5000;
const DEFAULT_KCHAT_RECEIVE_MODE = "webhook";
const KCHAT_RECEIVE_MODES = new Set(["webhook", "websocket", "both", "disabled"]);
const DEFAULT_KCHAT_WEBSOCKET_RECONNECT_INITIAL_MS = 1000;
const DEFAULT_KCHAT_WEBSOCKET_RECONNECT_MAX_MS = 30000;
const DEFAULT_KCHAT_WEBSOCKET_PROTOCOL = "infomaniak-echo";
const KCHAT_WEBSOCKET_PROTOCOLS = new Set(["infomaniak-echo", "mattermost"]);
const KCHAT_WEBSOCKET_CHANNEL_SCOPES = new Set(["all", "selected"]);
const DEFAULT_KCHAT_WEBSOCKET_DEDUPE_WINDOW_MS = 120000;
const DEFAULT_KCHAT_WEBSOCKET_DISPATCH_CONCURRENCY = 1;
const DEFAULT_KCHAT_WEBSOCKET_DISPATCH_QUEUE_SIZE = 100;
const DEFAULT_KCHAT_ECHO_WEBSOCKET_HOST = "websocket.kchat.infomaniak.com";
const DEFAULT_KCHAT_ECHO_APP_KEY = "kchat-key";
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
    apiBaseUrl: {
      type: "string",
      description:
        "Team-specific kChat API base URL. Defaults to https://<teamName>.kchat.infomaniak.com when teamName is configured.",
    },
    defaultChannel: {
      type: "string",
      description: "Default kChat destination. Supports id:<channel_id>, #channel, channel, or team/channel.",
    },
    setOnline: {
      type: "boolean",
      description: "Whether kChat should set the authenticated user online when creating posts.",
    },
    typingIndicator: {
      type: "boolean",
      default: true,
      description: "Whether inbound kChat replies should publish a native typing indicator while OpenClaw is preparing a reply.",
    },
    setOnlineOnReplyStart: {
      type: "boolean",
      description:
        "Whether inbound kChat replies should manually set the authenticated user online before publishing typing. Defaults to true when setOnline is true.",
    },
    receiveMode: {
      type: "string",
      enum: ["webhook", "websocket", "both", "disabled"],
      default: DEFAULT_KCHAT_RECEIVE_MODE,
      description:
        "Inbound receive mode. Use websocket to receive kChat/Mattermost events without a public webhook callback URL.",
    },
    websocketProtocol: {
      type: "string",
      enum: ["infomaniak-echo", "mattermost"],
      default: DEFAULT_KCHAT_WEBSOCKET_PROTOCOL,
      description:
        "WebSocket protocol to use. Infomaniak kChat uses infomaniak-echo; plain Mattermost servers may use mattermost.",
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
    websocketChannelScope: {
      type: "string",
      enum: ["all", "selected"],
      description:
        "WebSocket inbound channel scope. Use all to accept every visible channel, or selected to require websocketChannelIds.",
    },
    websocketUrl: {
      type: "string",
      description:
        "Optional explicit WebSocket URL. Defaults to the Infomaniak Echo socket URL or the Mattermost /api/v4/websocket URL based on websocketProtocol.",
    },
    websocketHost: {
      type: "string",
      default: DEFAULT_KCHAT_ECHO_WEBSOCKET_HOST,
      description: "Infomaniak Echo WebSocket host used when websocketProtocol is infomaniak-echo.",
    },
    websocketAppKey: {
      type: "string",
      default: DEFAULT_KCHAT_ECHO_APP_KEY,
      description: "Infomaniak Echo/Pusher app key used when websocketProtocol is infomaniak-echo.",
    },
    websocketAuthEndpoint: {
      type: "string",
      description:
        "Optional Infomaniak Echo private-channel auth endpoint. Defaults to <apiBaseUrl>/broadcasting/auth.",
    },
    websocketSubscriptions: {
      type: "array",
      items: {
        type: "string",
      },
      description:
        "Optional explicit Infomaniak Echo subscription channel names. Defaults to private-team.<team_id> and presence-teamUser.<user_id>.",
    },
    websocketTeamId: {
      type: "string",
      description: "Optional kChat team ID override for Infomaniak Echo subscriptions.",
    },
    websocketTeamUserId: {
      type: "string",
      description: "Optional kChat team user ID override for Infomaniak Echo subscriptions.",
    },
    websocketChannelIds: {
      type: "array",
      items: {
        type: "string",
      },
      description: "Optional kChat channel IDs to accept from the WebSocket stream. When omitted, all visible posted events are accepted.",
    },
    websocketDedupeWindowMs: {
      type: "number",
      minimum: 0,
      default: DEFAULT_KCHAT_WEBSOCKET_DEDUPE_WINDOW_MS,
      description: "Milliseconds to suppress duplicate WebSocket posts by post id. Set to 0 to disable duplicate suppression.",
    },
    websocketDispatchConcurrency: {
      type: "integer",
      minimum: 1,
      default: DEFAULT_KCHAT_WEBSOCKET_DISPATCH_CONCURRENCY,
      description: "Maximum number of WebSocket post events dispatched into OpenClaw at the same time.",
    },
    websocketDispatchQueueSize: {
      type: "integer",
      minimum: 0,
      default: DEFAULT_KCHAT_WEBSOCKET_DISPATCH_QUEUE_SIZE,
      description: "Maximum number of WebSocket post events waiting for dispatch before new events are dropped.",
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
        const apiBaseUrl = readOptionalString(inputRecord.apiBaseUrl);
        const defaultChannel = readOptionalString(inputRecord.defaultChannel);
        const setOnline = readOptionalBoolean(inputRecord.setOnline);
        const typingIndicator = readOptionalBoolean(inputRecord.typingIndicator);
        const setOnlineOnReplyStart = readOptionalBoolean(inputRecord.setOnlineOnReplyStart);
        const receiveMode = readOptionalString(inputRecord.receiveMode);
        const websocketProtocol = readOptionalString(inputRecord.websocketProtocol);
        const webhookPath = readOptionalString(inputRecord.webhookPath);
        const outgoingWebhookTokenEnvName = readOptionalString(inputRecord.outgoingWebhookTokenEnvName);
        const ignoredUserIds = readOptionalStringArray(inputRecord.ignoredUserIds);
        const ignoredUserNames = readOptionalStringArray(inputRecord.ignoredUserNames);
        const websocketChannelScope = readOptionalString(inputRecord.websocketChannelScope);
        const websocketUrl = readOptionalString(inputRecord.websocketUrl);
        const websocketHost = readOptionalString(inputRecord.websocketHost);
        const websocketAppKey = readOptionalString(inputRecord.websocketAppKey);
        const websocketAuthEndpoint = readOptionalString(inputRecord.websocketAuthEndpoint);
        const websocketSubscriptions = readOptionalStringArray(inputRecord.websocketSubscriptions);
        const websocketTeamId = readOptionalString(inputRecord.websocketTeamId);
        const websocketTeamUserId = readOptionalString(inputRecord.websocketTeamUserId);
        const websocketChannelIds = readOptionalStringArray(inputRecord.websocketChannelIds);
        const websocketDedupeWindowMs = readOptionalNumber(inputRecord.websocketDedupeWindowMs);
        const websocketDispatchConcurrency = readOptionalNumber(inputRecord.websocketDispatchConcurrency);
        const websocketDispatchQueueSize = readOptionalNumber(inputRecord.websocketDispatchQueueSize);

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
              ...(apiBaseUrl ? { apiBaseUrl } : {}),
              ...(defaultChannel ? { defaultChannel } : {}),
              ...(setOnline === undefined ? {} : { setOnline }),
              ...(typingIndicator === undefined ? {} : { typingIndicator }),
              ...(setOnlineOnReplyStart === undefined ? {} : { setOnlineOnReplyStart }),
              ...(isKnownKchatReceiveMode(receiveMode) ? { receiveMode } : {}),
              ...(isKnownKchatWebSocketProtocol(websocketProtocol) ? { websocketProtocol } : {}),
              ...(webhookPath ? { webhookPath } : {}),
              ...(outgoingWebhookTokenEnvName ? { outgoingWebhookTokenEnvName } : {}),
              ...(ignoredUserIds ? { ignoredUserIds } : {}),
              ...(ignoredUserNames ? { ignoredUserNames } : {}),
              ...(isKnownKchatWebSocketChannelScope(websocketChannelScope) ? { websocketChannelScope } : {}),
              ...(websocketUrl ? { websocketUrl } : {}),
              ...(websocketHost ? { websocketHost } : {}),
              ...(websocketAppKey ? { websocketAppKey } : {}),
              ...(websocketAuthEndpoint ? { websocketAuthEndpoint } : {}),
              ...(websocketSubscriptions ? { websocketSubscriptions } : {}),
              ...(websocketTeamId ? { websocketTeamId } : {}),
              ...(websocketTeamUserId ? { websocketTeamUserId } : {}),
              ...(websocketChannelIds ? { websocketChannelIds } : {}),
              ...(websocketDedupeWindowMs === undefined ? {} : { websocketDedupeWindowMs }),
              ...(websocketDispatchConcurrency === undefined ? {} : { websocketDispatchConcurrency }),
              ...(websocketDispatchQueueSize === undefined ? {} : { websocketDispatchQueueSize }),
            },
          },
        };
      },
    },
  }),
  actions: {
    prepareSendPayload({ ctx, to, threadId }) {
      assertKchatThreadedMessageToolSend({
        params: ctx.params,
        to,
        threadId,
        toolContext: ctx.toolContext,
      });
      return null;
    },
  },
  threading: {
    buildToolContext({ context, hasRepliedRef }) {
      const nativeChannelId = readOptionalString(context.NativeChannelId) ?? parseKchatChannelIdTarget(context.To);
      const currentChannelId = nativeChannelId ? formatKchatChannelIdTarget(nativeChannelId) : readOptionalString(context.To);
      const currentThreadTs =
        readOptionalString(context.MessageThreadId == null ? undefined : String(context.MessageThreadId)) ??
        readOptionalString(context.ReplyToId);

      return {
        ...(currentChannelId ? { currentChannelId } : {}),
        ...(currentThreadTs ? { currentThreadTs } : {}),
        ...(context.CurrentMessageId !== undefined ? { currentMessageId: context.CurrentMessageId } : {}),
        hasRepliedRef,
      };
    },
    resolveAutoThreadId({ to, toolContext }) {
      const currentThreadTs = readOptionalString(toolContext?.currentThreadTs);
      if (!currentThreadTs || !targetsResolveToSameKchatChannel(to, toolContext?.currentChannelId)) {
        return undefined;
      }

      return currentThreadTs;
    },
    resolveCurrentChannelId({ to }) {
      const channelId = parseKchatChannelIdTarget(to);
      return channelId ? formatKchatChannelIdTarget(channelId) : readOptionalString(to);
    },
  },
  messaging: {
    targetResolver: {
      hint: "Use id:<channel_id>, #channel, channel, or team/channel for kChat channel targets.",
      looksLikeId(raw, normalized) {
        return Boolean(parseKchatChannelIdTarget(raw) ?? parseKchatChannelIdTarget(normalized) ?? normalizeKchatChannelName(raw));
      },
      resolveTarget: resolveKchatMessagingTarget,
    },
    normalizeTarget(raw) {
      const channelId = parseKchatChannelIdTarget(raw);
      return channelId ? formatKchatChannelIdTarget(channelId) : readOptionalString(raw);
    },
    inferTargetChatType() {
      return "channel";
    },
    formatTargetDisplay({ target, display }) {
      if (display) {
        return display.startsWith("#") ? display : `#${display}`;
      }

      const channelId = parseKchatChannelIdTarget(target);
      return channelId ? `#${channelId}` : target;
    },
  },
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
        return { ok: true, to: normalizeKchatOutboundTarget(destination) };
      } catch (error) {
        return { ok: false, error };
      }
    },
    sendText(ctx) {
      return sendKchatText(ctx).then(({ deliveryResult }) => deliveryResult);
    },
  },
  gateway: {
    async startAccount(ctx) {
      const channelConfig = resolveKchatChannelConfig(ctx.cfg);
      if (channelConfig.enabled === false || !shouldStartKchatWebSocket(channelConfig)) {
        return undefined;
      }

      if (!ctx.channelRuntime) {
        ctx.log?.warn?.("kChat WebSocket receive mode is enabled, but OpenClaw channel runtime is unavailable.");
        return undefined;
      }

      return startKchatWebSocketGatewayAccount({
        cfg: ctx.cfg,
        channelConfig,
        channelRuntime: ctx.channelRuntime,
        abortSignal: ctx.abortSignal,
        log: ctx.log,
      });
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
    token: options.token,
  });
  const channelConfig = resolveKchatChannelConfig(ctx.cfg);
  const client = destination.client ?? resolveKchatClient({
    channelConfig,
    client: options.client,
    createClient: options.createClient,
    fetch: options.fetch,
    token: options.token,
  });
  const rootId = resolveKchatRootId(ctx);
  const body = {
    channel_id: destination.channelId,
    message: String(ctx.text ?? ""),
    ...(rootId ? { root_id: rootId } : {}),
  };
  const query = resolveKchatSetOnlineQuery(channelConfig);
  const providerResult = await resolveKchatOperations(client).createpost({
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

export async function sendKchatTypingIndicator(ctx, options = {}) {
  const channelConfig = options.channelConfig ?? resolveKchatChannelConfig(ctx.cfg);
  const client = resolveKchatClient({
    channelConfig,
    client: options.client,
    createClient: options.createClient,
    fetch: options.fetch,
    token: options.token,
  });
  const operations = resolveKchatOperations(client);
  const userId = readOptionalString(options.userId) ?? (await resolveKchatCurrentUserId(operations, { signal: ctx.signal }));
  const setOnlineOnReplyStart =
    readOptionalBoolean(channelConfig.setOnlineOnReplyStart) ?? (readOptionalBoolean(channelConfig.setOnline) === true);

  if (setOnlineOnReplyStart && !options.onlineStatusSent?.value) {
    if (options.onlineStatusSent) {
      options.onlineStatusSent.value = true;
    }
    try {
      await operations.updateuserstatus({
        path: { user_id: userId },
        body: {
          user_id: userId,
          status: "online",
        },
        ...(ctx.signal ? { signal: ctx.signal } : {}),
      });
    } catch (error) {
      logKchatTypingStatusFailure(options.log, error);
    }
  }

  await operations.publishusertyping({
    path: { user_id: userId },
    body: {
      channel_id: ctx.channelId,
      ...(ctx.parentId ? { parent_id: ctx.parentId } : {}),
    },
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
}

function createKchatInboundReplyPipeline({ cfg, channelConfig, replyRoute, client, createClient, fetch, token, log }) {
  if (!resolveKchatTypingIndicatorEnabled(channelConfig)) {
    return undefined;
  }

  const onlineStatusSent = { value: false };
  let currentUserIdPromise;
  const resolveCurrentUserId = async () => {
    currentUserIdPromise ??= (async () => {
      const resolvedClient = resolveKchatClient({
        channelConfig,
        client,
        createClient,
        fetch,
        token,
      });
      return await resolveKchatCurrentUserId(resolveKchatOperations(resolvedClient));
    })();
    try {
      return await currentUserIdPromise;
    } catch (error) {
      currentUserIdPromise = undefined;
      throw error;
    }
  };

  return {
    typing: {
      start: async () =>
        await sendKchatTypingIndicator(
          {
            cfg,
            channelId: replyRoute.nativeChannelId,
            parentId: replyRoute.threadRootId,
          },
          {
            channelConfig,
            client,
            createClient,
            fetch,
            token,
            userId: await resolveCurrentUserId(),
            onlineStatusSent,
            log,
          },
        ),
      onStartError: (error) => {
        logKchatTypingIndicatorFailure(log, error);
      },
    },
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
        client: options.client,
        createClient: options.createClient,
        fetch: options.fetch,
        token: options.token,
        log: options.log,
      });
    } catch (error) {
      if (isKchatInboundReplyRoutingError(error)) {
        options.log?.warn?.(`kChat webhook dispatch dropped: ${error.message}`);
        respondJson(res, 400, { ok: false, error: "missing_reply_channel" });
        return true;
      }

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

export async function dispatchKchatInboundWebhookEvent({ cfg, channelConfig, runtime, inbound, client, createClient, fetch, token, log }) {
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
        const replyRoute = resolveKchatInboundReplyRoute(inbound);
        const peer = {
          kind: "channel",
          id: replyRoute.nativeChannelId,
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

        const threadSession = resolveKchatInboundThreadSession({
          baseSessionKey: route.sessionKey,
          threadRootId: replyRoute.threadRootId,
        });
        const replyPipeline = createKchatInboundReplyPipeline({
          cfg,
          channelConfig,
          replyRoute,
          client,
          createClient,
          fetch,
          token,
          log,
        });
        const ctxPayload = channelRuntime.inbound.buildContext({
          channel: KCHAT_CHANNEL_ID,
          accountId,
          messageId: inbound.postId ?? input.id,
          timestamp: input.timestamp,
          from: formatKchatInboundFrom(inbound),
          sender: inbound.sender,
          conversation: {
            kind: "channel",
            id: replyRoute.nativeChannelId,
            ...(inbound.conversationLabel ? { label: inbound.conversationLabel } : {}),
            ...(replyRoute.threadRootId ? { threadId: replyRoute.threadRootId } : {}),
            nativeChannelId: replyRoute.nativeChannelId,
            routePeer: peer,
          },
          route: {
            agentId: route.agentId,
            accountId: route.accountId,
            routeSessionKey: route.sessionKey,
            dispatchSessionKey: threadSession.sessionKey,
            ...(threadSession.parentSessionKey ? { parentSessionKey: threadSession.parentSessionKey } : {}),
            mainSessionKey: route.mainSessionKey,
          },
          reply: replyRoute.reply,
          message: {
            rawBody: input.rawText,
            body: input.rawText,
            bodyForAgent: input.textForAgent,
            commandBody: input.textForCommands,
            inboundEventKind: "user_request",
          },
          extra: {
            kchat: inbound.raw,
            ...(replyRoute.threadRootId ? { KchatRootId: replyRoute.threadRootId } : {}),
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
          ...(replyPipeline ? { replyPipeline } : {}),
          delivery: {
            durable: () => ({
              to: replyRoute.to,
              ...(replyRoute.threadRootId ? { threadId: replyRoute.threadRootId, replyToId: replyRoute.replyToId } : {}),
              requiredCapabilities: { text: true, replyTo: true, thread: true },
            }),
            deliver: async (payload) => {
              const text = readOptionalString(payload.text) ?? readOptionalString(payload.body);
              if (!text) {
                return { visibleReplySent: false };
              }

              const result = await sendKchatText({
                cfg,
                to: replyRoute.to,
                text,
                ...(replyRoute.threadRootId ? { threadId: replyRoute.threadRootId, replyToId: replyRoute.replyToId } : {}),
              }, {
                client,
                createClient,
                fetch,
                token,
              });
              return {
                visibleReplySent: true,
                messageIds: result.messageId ? [result.messageId] : [],
                receipt: result.receipt,
                nativeChannelId: replyRoute.nativeChannelId,
                ...(replyRoute.threadRootId ? { threadId: replyRoute.threadRootId, replyToId: replyRoute.replyToId } : {}),
              };
            },
          },
          messageId: inbound.id,
          record: {
            updateLastRoute: {
              sessionKey: threadSession.sessionKey,
              channel: KCHAT_CHANNEL_ID,
              to: replyRoute.to,
              accountId: route.accountId,
              ...(replyRoute.threadRootId ? { threadId: replyRoute.threadRootId } : {}),
            },
          },
        };
      },
    },
  });
}

export async function startKchatWebSocketGatewayAccount(options = {}) {
  const channelConfig = options.channelConfig ?? resolveKchatChannelConfig(options.cfg);
  const token = options.token ?? readKchatBearerTokenFromEnv(channelConfig, options.env ?? globalThis.process?.env);
  const reconnectInitialMs =
    readOptionalNumber(channelConfig.websocketReconnectInitialMs) ?? DEFAULT_KCHAT_WEBSOCKET_RECONNECT_INITIAL_MS;
  const reconnectMaxMs = readOptionalNumber(channelConfig.websocketReconnectMaxMs) ?? DEFAULT_KCHAT_WEBSOCKET_RECONNECT_MAX_MS;
  const dedupeState = new Map();
  let reconnectDelayMs = reconnectInitialMs;

  if (!token) {
    throw new Error(`Set ${resolveKchatTokenEnvName(channelConfig)} in the environment before enabling kChat WebSocket receive mode.`);
  }

  while (!options.abortSignal?.aborted) {
    try {
      await runKchatWebSocketConnection({
        ...options,
        channelConfig,
        token,
        runtime: options.runtime ?? { channel: options.channelRuntime },
        dedupeState,
      });
      reconnectDelayMs = reconnectInitialMs;
    } catch (error) {
      if (options.abortSignal?.aborted) {
        break;
      }

      options.log?.warn?.(`kChat WebSocket connection ended: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!options.abortSignal?.aborted) {
      await sleepWithAbort(reconnectDelayMs, options.abortSignal);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, reconnectMaxMs);
    }
  }

  return undefined;
}

export async function runKchatWebSocketConnection(options = {}) {
  const channelConfig = options.channelConfig ?? resolveKchatChannelConfig(options.cfg);
  const token = options.token ?? readKchatBearerTokenFromEnv(channelConfig, options.env ?? globalThis.process?.env);
  if (!token) {
    throw new Error(`Set ${resolveKchatTokenEnvName(channelConfig)} in the environment before connecting to kChat WebSocket.`);
  }
  const WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;
  if (typeof WebSocketImpl !== "function") {
    throw new Error("A WebSocket implementation is required for kChat WebSocket receive mode.");
  }

  const teamName = readOptionalString(channelConfig.teamName);
  const apiBaseUrl = readOptionalString(channelConfig.apiBaseUrl);
  const websocketUrl = options.websocketUrl ?? readOptionalString(channelConfig.websocketUrl);
  const websocketHost = readOptionalString(channelConfig.websocketHost);
  const websocketAppKey = readOptionalString(channelConfig.websocketAppKey);
  const websocketAuthEndpoint = readOptionalString(channelConfig.websocketAuthEndpoint);
  const websocketSubscriptions = readOptionalStringArray(channelConfig.websocketSubscriptions);
  const websocketTeamId = readOptionalString(channelConfig.websocketTeamId);
  const websocketTeamUserId = readOptionalString(channelConfig.websocketTeamUserId);
  const dedupeState = options.dedupeState ?? new Map();

  resolveKchatWebSocketChannelScope(channelConfig);

  const dispatchQueue = createKchatWebSocketDispatchQueue({
    channelConfig,
    log: options.log,
    dispatch: (inbound) =>
      dispatchPreparedKchatWebSocketInbound({
        cfg: options.cfg,
        channelConfig,
        runtime: options.runtime,
        inbound,
        client: options.client,
        createClient: options.createClient,
        fetch: options.fetch,
        token,
        log: options.log,
      }),
    onResult(result) {
      logKchatWebSocketDispatchResult(result, options.log);
      options.onDispatchResult?.(result);
    },
    onError(error) {
      options.log?.error?.(`kChat WebSocket dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
    },
  });

  try {
    return await runLiquidKchatWebSocketConnection({
      protocol: resolveKchatWebSocketProtocol(channelConfig),
      token,
      fetch: options.fetch,
      webSocket: WebSocketImpl,
      signal: options.abortSignal,
      ...(teamName ? { teamName } : {}),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(websocketUrl ? { url: websocketUrl } : {}),
      ...(websocketHost ? { host: websocketHost } : {}),
      ...(websocketAppKey ? { appKey: websocketAppKey } : {}),
      ...(websocketAuthEndpoint ? { authEndpoint: websocketAuthEndpoint } : {}),
      ...(websocketSubscriptions ? { subscriptions: websocketSubscriptions } : {}),
      ...(websocketTeamId ? { teamId: websocketTeamId } : {}),
      ...(websocketTeamUserId ? { teamUserId: websocketTeamUserId } : {}),
      onFrame: options.onFrame,
      onAuthenticated: options.onAuthenticated,
      onSubscribed: options.onSubscribed,
      onPost(event) {
        options.onPost?.(event);
        const payload = normalizeKchatWebSocketPostEventPayload(event, channelConfig);
        const prepared = prepareKchatWebSocketDispatchPayload(payload, channelConfig);
        if (prepared.result) {
          dispatchQueue.report(prepared.result);
          return;
        }

        if (hasSeenKchatWebSocketPost(prepared.payload, channelConfig, dedupeState)) {
          dispatchQueue.report(createKchatWebSocketDispatchDrop("duplicate_post", prepared.payload));
          return;
        }

        if (!dispatchQueue.hasCapacity()) {
          dispatchQueue.report(createKchatWebSocketDispatchQueueFullDrop(prepared.payload));
          return;
        }

        markKchatWebSocketPostSeen(prepared.payload, channelConfig, dedupeState);
        dispatchQueue.enqueue(prepared.inbound);
      },
    });
  } finally {
    await dispatchQueue.drain();
  }
}

export const createKchatWebSocketAuthFrame = createLiquidKchatMattermostAuthFrame;

export function resolveKchatWebSocketUrl(channelConfig) {
  const teamName = readOptionalString(channelConfig.teamName);
  const apiBaseUrl = readOptionalString(channelConfig.apiBaseUrl);
  const websocketUrl = readOptionalString(channelConfig.websocketUrl);
  const websocketHost = readOptionalString(channelConfig.websocketHost);
  const websocketAppKey = readOptionalString(channelConfig.websocketAppKey);

  return resolveLiquidKchatWebSocketUrl({
    protocol: resolveKchatWebSocketProtocol(channelConfig),
    ...(teamName ? { teamName } : {}),
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(websocketUrl ? { url: websocketUrl } : {}),
    ...(websocketHost ? { host: websocketHost } : {}),
    ...(websocketAppKey ? { appKey: websocketAppKey } : {}),
  });
}

export async function dispatchKchatWebSocketEvent({ cfg, channelConfig, runtime, frame, dedupeState, client, createClient, fetch, token, log }) {
  const payload = normalizeKchatWebSocketPostEvent(frame, channelConfig);
  const prepared = prepareKchatWebSocketDispatchPayload(payload, channelConfig);
  if (prepared.result) {
    return prepared.result;
  }

  if (isDuplicateKchatWebSocketPost(prepared.payload, channelConfig, dedupeState)) {
    return createKchatWebSocketDispatchDrop("duplicate_post", prepared.payload);
  }

  return await dispatchPreparedKchatWebSocketInbound({
    cfg,
    channelConfig,
    runtime,
    inbound: prepared.inbound,
    client,
    createClient,
    fetch,
    token,
    log,
  });
}

export async function dispatchKchatWebSocketPostEvent({ cfg, channelConfig, runtime, event, dedupeState, client, createClient, fetch, token, log }) {
  const payload = normalizeKchatWebSocketPostEventPayload(event, channelConfig);
  const prepared = prepareKchatWebSocketDispatchPayload(payload, channelConfig);
  if (prepared.result) {
    return prepared.result;
  }

  if (isDuplicateKchatWebSocketPost(prepared.payload, channelConfig, dedupeState)) {
    return createKchatWebSocketDispatchDrop("duplicate_post", prepared.payload);
  }

  return await dispatchPreparedKchatWebSocketInbound({
    cfg,
    channelConfig,
    runtime,
    inbound: prepared.inbound,
    client,
    createClient,
    fetch,
    token,
    log,
  });
}

function prepareKchatWebSocketDispatchPayload(payload, channelConfig) {
  if (!payload) {
    return { result: { dispatched: false, reason: "unsupported_event" } };
  }

  if (!isAllowedKchatWebSocketChannel(payload, channelConfig)) {
    return { result: createKchatWebSocketDispatchDrop("channel_not_allowed", payload) };
  }

  if (shouldIgnoreKchatWebhookPayload(payload, channelConfig)) {
    return { result: createKchatWebSocketDispatchDrop("ignored_sender", payload) };
  }

  const inbound = normalizeKchatOutgoingWebhookPayload(payload);
  if (!inbound) {
    return { result: createKchatWebSocketDispatchDrop("invalid_payload", payload) };
  }

  if (!hasKchatInboundReplyRoute(inbound)) {
    return { result: createKchatWebSocketDispatchDrop("missing_reply_channel", payload) };
  }

  return { payload, inbound };
}

async function dispatchPreparedKchatWebSocketInbound({ cfg, channelConfig, runtime, inbound, client, createClient, fetch, token, log }) {
  await dispatchKchatInboundWebhookEvent({
    cfg,
    channelConfig,
    runtime,
    inbound,
    client,
    createClient,
    fetch,
    token,
    log,
  });
  return createKchatWebSocketDispatchSuccess(inbound);
}

export function normalizeKchatWebSocketPostEvent(frame, channelConfig = {}) {
  const event = normalizeLiquidKchatWebSocketPostEvent(frame, {
    ...(readOptionalString(channelConfig.teamName) ? { teamName: readOptionalString(channelConfig.teamName) } : {}),
  });
  return normalizeKchatWebSocketPostEventPayload(event, channelConfig);
}

function normalizeKchatWebSocketPostEventPayload(event, channelConfig = {}) {
  if (!isRecord(event)) {
    return undefined;
  }

  const channelId = readOptionalString(event.channelId);
  const channelName = readOptionalString(event.channelName);
  const teamDomain = readOptionalString(event.teamDomain) ?? readOptionalString(channelConfig.teamName);
  const teamId = readOptionalString(event.teamId);
  const postId = readOptionalString(event.postId) ?? readOptionalString(event.id);
  const rootId = readOptionalString(event.rootId);
  const userId = readOptionalString(event.userId);
  const userName = readOptionalString(event.userName);
  const text = readOptionalString(event.text);
  const createAt = readOptionalNumber(event.timestamp);

  return {
    ...(channelId ? { channel_id: channelId } : {}),
    ...(channelName ? { channel_name: channelName } : {}),
    ...(teamDomain ? { team_domain: teamDomain } : {}),
    ...(teamId ? { team_id: teamId } : {}),
    ...(postId ? { post_id: postId } : {}),
    ...(rootId ? { root_id: rootId } : {}),
    ...(userId ? { user_id: userId } : {}),
    ...(userName ? { user_name: userName } : {}),
    ...(text ? { text } : {}),
    ...(createAt === undefined ? {} : { create_at: createAt }),
  };
}

function createKchatWebSocketDispatchDrop(reason, payload) {
  return {
    dispatched: false,
    reason,
    ...createKchatWebSocketDispatchMetadata(payload),
  };
}

function createKchatWebSocketDispatchQueue(options) {
  const channelConfig = options.channelConfig ?? {};
  const concurrency = resolveKchatWebSocketDispatchConcurrency(channelConfig);
  const maxQueued = resolveKchatWebSocketDispatchQueueSize(channelConfig);
  const pending = [];
  const drainResolvers = [];
  let activeCount = 0;

  const resolveDrained = () => {
    if (activeCount > 0 || pending.length > 0) {
      return;
    }

    while (drainResolvers.length > 0) {
      drainResolvers.shift()?.();
    }
  };

  const start = (event) => {
    activeCount += 1;
    Promise.resolve()
      .then(() => options.dispatch(event))
      .then((result) => {
        options.onResult?.(result);
      })
      .catch((error) => {
        options.onError?.(error);
      })
      .finally(() => {
        activeCount -= 1;
        runNext();
      });
  };

  const runNext = () => {
    while (activeCount < concurrency && pending.length > 0) {
      start(pending.shift());
    }
    resolveDrained();
  };

  return {
    hasCapacity() {
      return activeCount < concurrency || pending.length < maxQueued;
    },
    report(result) {
      logKchatWebSocketDispatchResult(result, options.log);
      options.onResult?.(result);
    },
    enqueue(event) {
      if (activeCount < concurrency) {
        start(event);
        return true;
      }

      if (pending.length >= maxQueued) {
        const result = createKchatWebSocketDispatchQueueFullDrop(event, channelConfig);
        logKchatWebSocketDispatchResult(result, options.log);
        options.onResult?.(result);
        return false;
      }

      pending.push(event);
      return true;
    },
    drain() {
      if (activeCount === 0 && pending.length === 0) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        drainResolvers.push(resolve);
      });
    },
  };
}

function createKchatWebSocketDispatchQueueFullDrop(payload) {
  return createKchatWebSocketDispatchDrop("dispatch_queue_full", payload);
}

function createKchatWebSocketDispatchSuccess(inbound) {
  return {
    dispatched: true,
    inboundId: inbound.id,
    postId: inbound.postId ?? inbound.id,
    ...(inbound.channelId ? { channelId: inbound.channelId } : {}),
    ...(inbound.teamId ? { teamId: inbound.teamId } : {}),
    ...(inbound.sender.id ? { userId: inbound.sender.id } : {}),
    ...(inbound.sender.username ? { userName: inbound.sender.username } : {}),
  };
}

function createKchatWebSocketDispatchMetadata(payload) {
  const postId = readOptionalString(payload.post_id) ?? readOptionalString(payload.postId) ?? readOptionalString(payload.id);
  const channelId = readOptionalString(payload.channel_id) ?? readOptionalString(payload.channelId);
  const teamId = readOptionalString(payload.team_id) ?? readOptionalString(payload.teamId);
  const userId = readOptionalString(payload.user_id) ?? readOptionalString(payload.userId);
  const userName = readOptionalString(payload.user_name) ?? readOptionalString(payload.userName);

  return {
    ...(postId ? { postId } : {}),
    ...(channelId ? { channelId } : {}),
    ...(teamId ? { teamId } : {}),
    ...(userId ? { userId } : {}),
    ...(userName ? { userName } : {}),
  };
}

function logKchatWebSocketDispatchResult(result, log) {
  if (result?.dispatched !== false) {
    return;
  }

  const reason = readOptionalString(result.reason) ?? "unknown";
  const fields = [
    ["postId", result.postId],
    ["channelId", result.channelId],
    ["teamId", result.teamId],
    ["userId", result.userId],
    ["userName", result.userName],
  ]
    .map(([key, value]) => (readOptionalString(value) ? `${key}=${value}` : undefined))
    .filter(Boolean);
  log?.debug?.(`kChat WebSocket event dropped: reason=${reason}${fields.length > 0 ? ` ${fields.join(" ")}` : ""}`);
}

function logKchatTypingStatusFailure(log, error) {
  log?.warn?.(`kChat typing status update failed: ${formatKchatSafeError(error)}`);
}

function logKchatTypingIndicatorFailure(log, error) {
  log?.warn?.(`kChat typing indicator failed: ${formatKchatSafeError(error)}`);
}

function formatKchatSafeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return redactKchatSensitiveText(message);
}

function redactKchatSensitiveText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(\b(?:access_)?token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(authorization["':=\s]+)[^,\s}]+/gi, "$1[redacted]");
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
  if (channelConfig.enabled === false || !shouldRegisterKchatWebhook(channelConfig)) {
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

function resolveKchatReceiveMode(channelConfig) {
  const receiveMode = readOptionalString(channelConfig.receiveMode);
  return isKnownKchatReceiveMode(receiveMode) ? receiveMode : DEFAULT_KCHAT_RECEIVE_MODE;
}

function isKnownKchatReceiveMode(receiveMode) {
  return receiveMode !== undefined && KCHAT_RECEIVE_MODES.has(receiveMode);
}

function shouldRegisterKchatWebhook(channelConfig) {
  const receiveMode = resolveKchatReceiveMode(channelConfig);
  return receiveMode === "webhook" || receiveMode === "both";
}

function shouldStartKchatWebSocket(channelConfig) {
  const receiveMode = resolveKchatReceiveMode(channelConfig);
  return receiveMode === "websocket" || receiveMode === "both";
}

function resolveKchatWebSocketProtocol(channelConfig) {
  const protocol = readOptionalString(channelConfig.websocketProtocol);
  return isKnownKchatWebSocketProtocol(protocol) ? protocol : DEFAULT_KCHAT_WEBSOCKET_PROTOCOL;
}

function isKnownKchatWebSocketProtocol(protocol) {
  return protocol !== undefined && KCHAT_WEBSOCKET_PROTOCOLS.has(protocol);
}

function isKnownKchatWebSocketChannelScope(scope) {
  return scope !== undefined && KCHAT_WEBSOCKET_CHANNEL_SCOPES.has(scope);
}

function resolveKchatWebSocketDispatchConcurrency(channelConfig) {
  return resolveKchatIntegerConfig(
    channelConfig.websocketDispatchConcurrency,
    DEFAULT_KCHAT_WEBSOCKET_DISPATCH_CONCURRENCY,
    1,
  );
}

function resolveKchatWebSocketDispatchQueueSize(channelConfig) {
  return resolveKchatIntegerConfig(
    channelConfig.websocketDispatchQueueSize,
    DEFAULT_KCHAT_WEBSOCKET_DISPATCH_QUEUE_SIZE,
    0,
  );
}

function resolveKchatIntegerConfig(value, defaultValue, minimum) {
  const resolved = readOptionalNumber(value);
  if (resolved === undefined || resolved < minimum) {
    return defaultValue;
  }

  return Math.trunc(resolved);
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

function assertKchatThreadedMessageToolSend({ params, to, threadId, toolContext }) {
  const currentThreadTs = readOptionalString(toolContext?.currentThreadTs);
  if (!currentThreadTs || readOptionalString(threadId == null ? undefined : String(threadId))) {
    return;
  }

  if (params?.topLevel === true || !targetsResolveToSameKchatChannel(to, toolContext?.currentChannelId)) {
    return;
  }

  throw new Error("This session is bound to a kChat thread; include threadId or set topLevel:true for a top-level kChat post.");
}

async function resolveKchatMessagingTarget({ cfg, input, normalized, preferredKind }) {
  if (preferredKind === "user") {
    return null;
  }

  const target = readOptionalString(normalized) ?? readOptionalString(input);
  if (!target) {
    return null;
  }

  const idTarget = parseKchatChannelIdTarget(target);
  if (idTarget) {
    return {
      to: formatKchatChannelIdTarget(idTarget),
      kind: "channel",
      display: idTarget,
      source: "normalized",
    };
  }

  const channelConfig = resolveKchatChannelConfig(cfg);
  const namedDestination = parseKchatNamedDestination(target, channelConfig);
  if (!namedDestination.teamName) {
    throw new Error(
      "kChat teamName is required to resolve channel names. Configure channels.kchat.teamName or use team/channel.",
    );
  }

  const client = resolveKchatClient({ channelConfig });
  const channel = await resolveKchatOperations(client).getchannelbynameforteamname({
    path: {
      team_name: namedDestination.teamName,
      channel_name: namedDestination.channelName,
    },
  });
  const channelId = resolveProviderChannelId(channel);

  if (!channelId) {
    throw new Error(`kChat channel lookup did not return an id for ${namedDestination.teamName}/${namedDestination.channelName}.`);
  }

  return {
    to: formatKchatChannelIdTarget(channelId),
    kind: "channel",
    display: namedDestination.channelName,
    source: "directory",
  };
}

async function resolveKchatDestination({ cfg, to, client, createClient, fetch, signal, token }) {
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
    token,
  });
  const channel = await resolveKchatOperations(resolvedClient).getchannelbynameforteamname({
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
  const channelId = parseKchatChannelIdTarget(destination);
  if (!channelId) {
    if (readOptionalString(destination)?.toLowerCase().startsWith("id:")) {
      throw new Error("kChat id: destination must include a channel_id.");
    }

    return undefined;
  }

  return {
    channelId,
    conversationId: formatKchatChannelIdTarget(channelId),
  };
}

function parseKchatChannelIdTarget(value) {
  const target = readOptionalString(value);
  if (!target || !target.toLowerCase().startsWith("id:")) {
    return undefined;
  }

  return readOptionalString(target.slice("id:".length));
}

function formatKchatChannelIdTarget(channelId) {
  return `id:${channelId}`;
}

function normalizeKchatOutboundTarget(target) {
  const channelId = parseKchatChannelIdTarget(target);
  return channelId ? formatKchatChannelIdTarget(channelId) : target;
}

function targetsResolveToSameKchatChannel(left, right) {
  const leftChannelId = parseKchatChannelIdTarget(left);
  const rightChannelId = parseKchatChannelIdTarget(right);
  return Boolean(leftChannelId && rightChannelId && leftChannelId === rightChannelId);
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

function resolveKchatClient({ channelConfig, client, createClient, fetch, token: tokenOverride }) {
  if (client) {
    return client;
  }

  const token = readOptionalString(tokenOverride) ?? readKchatBearerTokenFromEnv(channelConfig, globalThis.process?.env);
  if (!token) {
    throw new Error(`Set ${resolveKchatTokenEnvName(channelConfig)} in the environment before sending kChat messages.`);
  }

  const baseUrl = resolveKchatApiBaseUrl(channelConfig);
  if (!baseUrl) {
    throw new Error("Configure channels.kchat.apiBaseUrl or a DNS-safe channels.kchat.teamName before sending kChat messages.");
  }

  const clientFactory = createClient ?? createInfomaniakClient;
  return clientFactory({
    token,
    baseUrl,
    fetch: fetch ?? globalThis.fetch,
  });
}

function readKchatBearerTokenFromEnv(channelConfig, env) {
  return readOptionalString(env?.[resolveKchatTokenEnvName(channelConfig)]);
}

function resolveKchatApiBaseUrl(channelConfig) {
  const apiBaseUrl = readOptionalString(channelConfig.apiBaseUrl);
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  const teamName = readOptionalString(channelConfig.teamName);
  if (!teamName) {
    return undefined;
  }

  const hostLabel = teamName.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(hostLabel)) {
    throw new Error("channels.kchat.teamName must be a DNS-safe kChat team slug when apiBaseUrl is omitted.");
  }

  return `https://${hostLabel}.kchat.infomaniak.com`;
}

function resolveKchatOperations(client) {
  const operations = client?.kchat?.operations ?? client?.kchat;
  if (!isRecord(operations)) {
    throw new Error("Infomaniak kChat operations are unavailable.");
  }

  return operations;
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

function resolveKchatTypingIndicatorEnabled(channelConfig) {
  return readOptionalBoolean(channelConfig.typingIndicator) ?? true;
}

async function resolveKchatCurrentUserId(operations, options = {}) {
  if (typeof operations.getuser !== "function") {
    throw new Error("Infomaniak kChat getuser operation is unavailable.");
  }

  const currentUser = await operations.getuser({
    path: {
      user_id: "me",
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const userId = resolveProviderUserId(currentUser);
  if (!userId) {
    throw new Error("Infomaniak kChat current user response did not include an id.");
  }

  return userId;
}

function resolveProviderChannelId(value) {
  const record = unwrapProviderRecord(value);
  return readOptionalString(record?.id) ?? readOptionalString(record?.channel_id);
}

function resolveProviderUserId(value) {
  const record = unwrapProviderRecord(value);
  return readOptionalString(record?.id) ?? readOptionalString(record?.user_id);
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

function isAllowedKchatWebSocketChannel(payload, channelConfig) {
  const channelScope = resolveKchatWebSocketChannelScope(channelConfig);
  if (channelScope.scope === "all") {
    return true;
  }

  const channelId = readOptionalString(payload.channel_id) ?? readOptionalString(payload.channelId);
  return Boolean(channelId && channelScope.channelIds.includes(channelId));
}

function resolveKchatWebSocketChannelScope(channelConfig) {
  const configuredScope = readOptionalString(channelConfig.websocketChannelScope);
  if (configuredScope && !isKnownKchatWebSocketChannelScope(configuredScope)) {
    throw new Error('channels.kchat.websocketChannelScope must be "all" or "selected".');
  }

  const channelIds = readOptionalStringArray(channelConfig.websocketChannelIds) ?? [];
  if (configuredScope === "all") {
    return { scope: "all", channelIds: [] };
  }

  if (configuredScope === "selected") {
    if (channelIds.length === 0) {
      throw new Error('channels.kchat.websocketChannelScope="selected" requires at least one websocketChannelIds entry.');
    }
    return { scope: "selected", channelIds };
  }

  return channelIds.length > 0 ? { scope: "selected", channelIds } : { scope: "all", channelIds: [] };
}

function isDuplicateKchatWebSocketPost(payload, channelConfig, dedupeState, now = Date.now()) {
  if (hasSeenKchatWebSocketPost(payload, channelConfig, dedupeState, now)) {
    return true;
  }

  markKchatWebSocketPostSeen(payload, channelConfig, dedupeState, now);
  return false;
}

function hasSeenKchatWebSocketPost(payload, channelConfig, dedupeState, now = Date.now()) {
  if (!(dedupeState instanceof Map)) {
    return false;
  }

  const windowMs = readOptionalNumber(channelConfig.websocketDedupeWindowMs) ?? DEFAULT_KCHAT_WEBSOCKET_DEDUPE_WINDOW_MS;
  if (windowMs <= 0) {
    return false;
  }

  const postId = readOptionalString(payload.post_id) ?? readOptionalString(payload.postId) ?? readOptionalString(payload.id);
  if (!postId) {
    return false;
  }

  pruneKchatWebSocketDedupeState(dedupeState, windowMs, now);
  return dedupeState.has(postId);
}

function markKchatWebSocketPostSeen(payload, channelConfig, dedupeState, now = Date.now()) {
  if (!(dedupeState instanceof Map)) {
    return;
  }

  const windowMs = readOptionalNumber(channelConfig.websocketDedupeWindowMs) ?? DEFAULT_KCHAT_WEBSOCKET_DEDUPE_WINDOW_MS;
  if (windowMs <= 0) {
    return;
  }

  const postId = readOptionalString(payload.post_id) ?? readOptionalString(payload.postId) ?? readOptionalString(payload.id);
  if (!postId) {
    return;
  }

  pruneKchatWebSocketDedupeState(dedupeState, windowMs, now);
  dedupeState.set(postId, now);
}

function pruneKchatWebSocketDedupeState(dedupeState, windowMs, now) {
  for (const [seenPostId, seenAt] of dedupeState) {
    if (now - seenAt > windowMs) {
      dedupeState.delete(seenPostId);
    }
  }
}

async function sleepWithAbort(ms, abortSignal) {
  if (abortSignal?.aborted || ms <= 0) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };
    abortSignal?.addEventListener?.("abort", onAbort, { once: true });
  });
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

function hasKchatInboundReplyRoute(inbound) {
  return Boolean(readOptionalString(inbound?.channelId));
}

function resolveKchatInboundReplyRoute(inbound) {
  const nativeChannelId = readOptionalString(inbound?.channelId);
  if (!nativeChannelId) {
    throw createKchatInboundReplyRoutingError(
      "kChat inbound payload did not include channel_id; refusing to use defaultChannel for inbound replies.",
    );
  }

  const threadRootId = readOptionalString(inbound.rootId) ?? readOptionalString(inbound.postId);
  const to = `id:${nativeChannelId}`;
  return {
    to,
    nativeChannelId,
    threadRootId,
    replyToId: threadRootId,
    reply: {
      to,
      nativeChannelId,
      ...(threadRootId ? { messageThreadId: threadRootId, replyToId: threadRootId } : {}),
      sourceReplyDeliveryMode: "thread",
    },
  };
}

function resolveKchatInboundThreadSession({ baseSessionKey, threadRootId }) {
  return resolveThreadSessionKeys({
    baseSessionKey,
    threadId: threadRootId,
    parentSessionKey: threadRootId ? baseSessionKey : undefined,
  });
}

function createKchatInboundReplyRoutingError(message) {
  const error = new Error(message);
  error.code = "KCHAT_INBOUND_MISSING_REPLY_CHANNEL";
  return error;
}

function isKchatInboundReplyRoutingError(error) {
  return isRecord(error) && error.code === "KCHAT_INBOUND_MISSING_REPLY_CHANNEL";
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
