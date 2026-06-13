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
const DEFAULT_KCHAT_RECEIVE_MODE = "webhook";
const KCHAT_RECEIVE_MODES = new Set(["webhook", "websocket", "both", "disabled"]);
const DEFAULT_KCHAT_WEBSOCKET_RECONNECT_INITIAL_MS = 1000;
const DEFAULT_KCHAT_WEBSOCKET_RECONNECT_MAX_MS = 30000;
const KCHAT_WEBSOCKET_AUTH_SEQ = 1;
const DEFAULT_KCHAT_WEBSOCKET_PROTOCOL = "infomaniak-echo";
const KCHAT_WEBSOCKET_PROTOCOLS = new Set(["infomaniak-echo", "mattermost"]);
const DEFAULT_KCHAT_ECHO_WEBSOCKET_HOST = "websocket.kchat.infomaniak.com";
const DEFAULT_KCHAT_ECHO_APP_KEY = "kchat-key";
const KCHAT_ECHO_CLIENT_NAME = "potassium-openclaw";
const KCHAT_ECHO_CLIENT_VERSION = "0.2.0";
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
        const receiveMode = readOptionalString(inputRecord.receiveMode);
        const websocketProtocol = readOptionalString(inputRecord.websocketProtocol);
        const webhookPath = readOptionalString(inputRecord.webhookPath);
        const outgoingWebhookTokenEnvName = readOptionalString(inputRecord.outgoingWebhookTokenEnvName);
        const ignoredUserIds = readOptionalStringArray(inputRecord.ignoredUserIds);
        const ignoredUserNames = readOptionalStringArray(inputRecord.ignoredUserNames);
        const websocketUrl = readOptionalString(inputRecord.websocketUrl);
        const websocketHost = readOptionalString(inputRecord.websocketHost);
        const websocketAppKey = readOptionalString(inputRecord.websocketAppKey);
        const websocketAuthEndpoint = readOptionalString(inputRecord.websocketAuthEndpoint);
        const websocketSubscriptions = readOptionalStringArray(inputRecord.websocketSubscriptions);
        const websocketTeamId = readOptionalString(inputRecord.websocketTeamId);
        const websocketTeamUserId = readOptionalString(inputRecord.websocketTeamUserId);
        const websocketChannelIds = readOptionalStringArray(inputRecord.websocketChannelIds);

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
              ...(isKnownKchatReceiveMode(receiveMode) ? { receiveMode } : {}),
              ...(isKnownKchatWebSocketProtocol(websocketProtocol) ? { websocketProtocol } : {}),
              ...(webhookPath ? { webhookPath } : {}),
              ...(outgoingWebhookTokenEnvName ? { outgoingWebhookTokenEnvName } : {}),
              ...(ignoredUserIds ? { ignoredUserIds } : {}),
              ...(ignoredUserNames ? { ignoredUserNames } : {}),
              ...(websocketUrl ? { websocketUrl } : {}),
              ...(websocketHost ? { websocketHost } : {}),
              ...(websocketAppKey ? { websocketAppKey } : {}),
              ...(websocketAuthEndpoint ? { websocketAuthEndpoint } : {}),
              ...(websocketSubscriptions ? { websocketSubscriptions } : {}),
              ...(websocketTeamId ? { websocketTeamId } : {}),
              ...(websocketTeamUserId ? { websocketTeamUserId } : {}),
              ...(websocketChannelIds ? { websocketChannelIds } : {}),
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

export async function startKchatWebSocketGatewayAccount(options = {}) {
  const channelConfig = options.channelConfig ?? resolveKchatChannelConfig(options.cfg);
  const token = options.token ?? readKchatBearerTokenFromEnv(channelConfig, options.env ?? globalThis.process?.env);
  const websocketUrl = resolveKchatWebSocketUrl(channelConfig);
  const reconnectInitialMs =
    readOptionalNumber(channelConfig.websocketReconnectInitialMs) ?? DEFAULT_KCHAT_WEBSOCKET_RECONNECT_INITIAL_MS;
  const reconnectMaxMs = readOptionalNumber(channelConfig.websocketReconnectMaxMs) ?? DEFAULT_KCHAT_WEBSOCKET_RECONNECT_MAX_MS;
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
        websocketUrl,
        runtime: options.runtime ?? { channel: options.channelRuntime },
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
  if (resolveKchatWebSocketProtocol(channelConfig) === "infomaniak-echo") {
    return runKchatEchoWebSocketConnection({
      ...options,
      channelConfig,
    });
  }

  const WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;
  if (typeof WebSocketImpl !== "function") {
    throw new Error("A WebSocket implementation is required for kChat WebSocket receive mode.");
  }

  const token = options.token ?? readKchatBearerTokenFromEnv(channelConfig, options.env ?? globalThis.process?.env);
  if (!token) {
    throw new Error(`Set ${resolveKchatTokenEnvName(channelConfig)} in the environment before connecting to kChat WebSocket.`);
  }

  const websocketUrl = options.websocketUrl ?? resolveKchatWebSocketUrl(channelConfig);
  const socket = new WebSocketImpl(websocketUrl);

  return await new Promise((resolve, reject) => {
    let settled = false;
    let authenticated = false;
    const cleanups = [];

    const settle = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      options.abortSignal?.removeEventListener?.("abort", onAbort);
      fn(value);
    };

    const handleFrame = (frame) => {
      options.onFrame?.(frame);

      if (isKchatWebSocketAuthReply(frame)) {
        if (frame.status !== "OK") {
          settle(reject, new Error("kChat WebSocket authentication failed."));
          closeKchatWebSocket(socket);
          return;
        }

        authenticated = true;
        options.onAuthenticated?.();
        return;
      }

      if (!authenticated && frame.event !== "hello") {
        return;
      }

      dispatchKchatWebSocketEvent({
        cfg: options.cfg,
        channelConfig,
        runtime: options.runtime,
        frame,
      })
        .then((result) => {
          options.onDispatchResult?.(result);
        })
        .catch((error) => {
          options.log?.error?.(`kChat WebSocket dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const onOpen = () => {
      socket.send(JSON.stringify(createKchatWebSocketAuthFrame(token)));
    };
    const onMessage = (event) => {
      const frame = parseKchatWebSocketFrame(resolveKchatWebSocketMessageData(event));
      if (frame) {
        handleFrame(frame);
      }
    };
    const onError = (event) => {
      if (!authenticated) {
        settle(reject, resolveKchatWebSocketError(event));
      }
    };
    const onClose = () => {
      settle(resolve, undefined);
    };
    const onAbort = () => {
      closeKchatWebSocket(socket);
      settle(resolve, undefined);
    };

    cleanups.push(addWebSocketListener(socket, "open", onOpen));
    cleanups.push(addWebSocketListener(socket, "message", onMessage));
    cleanups.push(addWebSocketListener(socket, "error", onError));
    cleanups.push(addWebSocketListener(socket, "close", onClose));

    if (options.abortSignal?.aborted) {
      onAbort();
      return;
    }
    options.abortSignal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

async function runKchatEchoWebSocketConnection(options = {}) {
  const WebSocketImpl = options.WebSocketImpl ?? globalThis.WebSocket;
  if (typeof WebSocketImpl !== "function") {
    throw new Error("A WebSocket implementation is required for kChat WebSocket receive mode.");
  }

  const channelConfig = options.channelConfig ?? resolveKchatChannelConfig(options.cfg);
  const token = options.token ?? readKchatBearerTokenFromEnv(channelConfig, options.env ?? globalThis.process?.env);
  if (!token) {
    throw new Error(`Set ${resolveKchatTokenEnvName(channelConfig)} in the environment before connecting to kChat WebSocket.`);
  }

  const websocketUrl = options.websocketUrl ?? resolveKchatWebSocketUrl(channelConfig);
  const socket = new WebSocketImpl(websocketUrl);

  return await new Promise((resolve, reject) => {
    let settled = false;
    let subscriptionsStarted = false;
    const cleanups = [];

    const settle = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      options.abortSignal?.removeEventListener?.("abort", onAbort);
      fn(value);
    };

    const subscribe = async (socketId) => {
      if (subscriptionsStarted) {
        return;
      }
      subscriptionsStarted = true;

      try {
        const channelNames = await resolveKchatEchoSubscriptionChannels({
          channelConfig,
          token,
          fetch: options.fetch,
        });

        for (const channelName of channelNames) {
          const auth = await authorizeKchatEchoSubscription({
            channelConfig,
            token,
            socketId,
            channelName,
            fetch: options.fetch,
          });
          socket.send(JSON.stringify(createKchatEchoSubscribeFrame(channelName, auth)));
        }

        options.onAuthenticated?.();
      } catch (error) {
        closeKchatWebSocket(socket);
        settle(reject, error instanceof Error ? error : new Error(String(error)));
      }
    };

    const handleFrame = (frame) => {
      options.onFrame?.(frame);

      if (frame.event === "pusher:connection_established") {
        const data = parseKchatEchoFrameData(frame.data);
        const socketId = readOptionalString(data?.socket_id);
        if (!socketId) {
          closeKchatWebSocket(socket);
          settle(reject, new Error("kChat WebSocket connection did not return a socket id."));
          return;
        }

        subscribe(socketId);
        return;
      }

      if (frame.event === "pusher:ping") {
        socket.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }

      if (frame.event === "pusher:error") {
        closeKchatWebSocket(socket);
        settle(reject, new Error(readOptionalString(parseKchatEchoFrameData(frame.data)?.message) ?? "kChat WebSocket server returned an error."));
        return;
      }

      if (frame.event === "pusher_internal:subscription_succeeded") {
        options.onSubscribed?.(frame.channel);
        return;
      }

      if (typeof frame.event === "string" && frame.event.startsWith("pusher:")) {
        return;
      }

      dispatchKchatWebSocketEvent({
        cfg: options.cfg,
        channelConfig,
        runtime: options.runtime,
        frame,
      })
        .then((result) => {
          options.onDispatchResult?.(result);
        })
        .catch((error) => {
          options.log?.error?.(`kChat WebSocket dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
        });
    };

    const onMessage = (event) => {
      const frame = parseKchatWebSocketFrame(resolveKchatWebSocketMessageData(event));
      if (frame) {
        handleFrame(frame);
      }
    };
    const onError = (event) => {
      settle(reject, resolveKchatWebSocketError(event));
    };
    const onClose = () => {
      settle(resolve, undefined);
    };
    const onAbort = () => {
      closeKchatWebSocket(socket);
      settle(resolve, undefined);
    };

    cleanups.push(addWebSocketListener(socket, "message", onMessage));
    cleanups.push(addWebSocketListener(socket, "error", onError));
    cleanups.push(addWebSocketListener(socket, "close", onClose));

    if (options.abortSignal?.aborted) {
      onAbort();
      return;
    }
    options.abortSignal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export function createKchatWebSocketAuthFrame(token, seq = KCHAT_WEBSOCKET_AUTH_SEQ) {
  return {
    seq,
    action: "authentication_challenge",
    data: {
      token,
    },
  };
}

export function resolveKchatWebSocketUrl(channelConfig) {
  const websocketUrl = readOptionalString(channelConfig.websocketUrl);
  if (websocketUrl) {
    return websocketUrl;
  }

  if (resolveKchatWebSocketProtocol(channelConfig) === "infomaniak-echo") {
    const websocketHost = readOptionalString(channelConfig.websocketHost) ?? DEFAULT_KCHAT_ECHO_WEBSOCKET_HOST;
    const appKey = readOptionalString(channelConfig.websocketAppKey) ?? DEFAULT_KCHAT_ECHO_APP_KEY;
    const url = new URL(`wss://${websocketHost}/app/${encodeURIComponent(appKey)}`);
    url.searchParams.set("protocol", "7");
    url.searchParams.set("client", KCHAT_ECHO_CLIENT_NAME);
    url.searchParams.set("version", KCHAT_ECHO_CLIENT_VERSION);
    url.searchParams.set("flash", "false");
    return url.toString();
  }

  const apiBaseUrl = resolveKchatApiBaseUrl(channelConfig);
  if (!apiBaseUrl) {
    throw new Error("Configure channels.kchat.apiBaseUrl or a DNS-safe channels.kchat.teamName before enabling kChat WebSocket receive mode.");
  }

  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/api/v4/websocket";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function dispatchKchatWebSocketEvent({ cfg, channelConfig, runtime, frame }) {
  const payload = normalizeKchatWebSocketPostEvent(frame, channelConfig);
  if (!payload) {
    return { dispatched: false, reason: "unsupported_event" };
  }

  if (!isAllowedKchatWebSocketChannel(payload, channelConfig)) {
    return { dispatched: false, reason: "ignored_channel" };
  }

  if (shouldIgnoreKchatWebhookPayload(payload, channelConfig)) {
    return { dispatched: false, reason: "ignored_sender" };
  }

  const inbound = normalizeKchatOutgoingWebhookPayload(payload);
  if (!inbound) {
    return { dispatched: false, reason: "invalid_payload" };
  }

  await dispatchKchatInboundWebhookEvent({
    cfg,
    channelConfig,
    runtime,
    inbound,
  });
  return { dispatched: true, inboundId: inbound.id };
}

export function normalizeKchatWebSocketPostEvent(frame, channelConfig = {}) {
  if (!isRecord(frame) || frame.event !== "posted") {
    return undefined;
  }

  const data = parseKchatEchoFrameData(frame.data) ?? {};
  const broadcast = isRecord(frame.broadcast) ? frame.broadcast : {};
  const post = parseKchatWebSocketPost(data.post);
  if (!post) {
    return undefined;
  }

  const channelId = readOptionalString(post.channel_id) ?? readOptionalString(post.channelId) ?? readOptionalString(broadcast.channel_id);
  const channelName =
    readOptionalString(data.channel_name) ??
    readOptionalString(data.channelName) ??
    readOptionalString(data.channel_display_name) ??
    readOptionalString(data.channelDisplayName);
  const teamDomain =
    readOptionalString(data.team_domain) ??
    readOptionalString(data.teamDomain) ??
    readOptionalString(data.team_name) ??
    readOptionalString(channelConfig.teamName);
  const teamId =
    readOptionalString(post.team_id) ??
    readOptionalString(post.teamId) ??
    readOptionalString(data.team_id) ??
    readOptionalString(broadcast.team_id);
  const postId = readOptionalString(post.id) ?? readOptionalString(post.post_id);
  const rootId = readOptionalString(post.root_id) ?? readOptionalString(post.rootId);
  const userId = readOptionalString(post.user_id) ?? readOptionalString(post.userId);
  const userName =
    readOptionalString(data.sender_name) ??
    readOptionalString(data.senderName) ??
    readOptionalString(post.user_name) ??
    readOptionalString(post.userName);
  const text = readOptionalString(post.message) ?? readOptionalString(data.message);
  const createAt = readOptionalNumber(post.create_at) ?? readOptionalNumber(post.createAt);

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

  const token = readKchatBearerTokenFromEnv(channelConfig, globalThis.process?.env);
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

function parseKchatWebSocketFrame(data) {
  const text = readKchatWebSocketText(data);
  if (!text) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function resolveKchatEchoSubscriptionChannels({ channelConfig, token, fetch }) {
  const configuredSubscriptions = readOptionalStringArray(channelConfig.websocketSubscriptions);
  if (configuredSubscriptions) {
    return configuredSubscriptions;
  }

  const [teamId, teamUserId] = await Promise.all([
    resolveKchatEchoTeamId({ channelConfig, token, fetch }),
    resolveKchatEchoTeamUserId({ channelConfig, token, fetch }),
  ]);
  return [`private-team.${teamId}`, `presence-teamUser.${teamUserId}`];
}

async function resolveKchatEchoTeamId({ channelConfig, token, fetch }) {
  const configuredTeamId = readOptionalString(channelConfig.websocketTeamId);
  if (configuredTeamId) {
    return configuredTeamId;
  }

  const teamName = readOptionalString(channelConfig.teamName);
  if (!teamName) {
    throw new Error("Configure channels.kchat.teamName, websocketTeamId, or websocketSubscriptions for kChat WebSocket receive mode.");
  }

  const baseUrl = resolveKchatApiBaseUrl(channelConfig);
  const team = await fetchKchatJson({
    url: `${baseUrl}/api/v4/teams/name/${encodeURIComponent(teamName)}`,
    token,
    fetch,
  });
  const teamId = readOptionalString(team.id);
  if (!teamId) {
    throw new Error(`kChat team lookup did not return an id for ${teamName}.`);
  }

  return teamId;
}

async function resolveKchatEchoTeamUserId({ channelConfig, token, fetch }) {
  const configuredTeamUserId = readOptionalString(channelConfig.websocketTeamUserId);
  if (configuredTeamUserId) {
    return configuredTeamUserId;
  }

  const baseUrl = resolveKchatApiBaseUrl(channelConfig);
  const user = await fetchKchatJson({
    url: `${baseUrl}/api/v4/users/me`,
    token,
    fetch,
  });
  const userId = readOptionalString(user.id);
  if (!userId) {
    throw new Error("kChat current-user lookup did not return an id.");
  }

  return userId;
}

async function authorizeKchatEchoSubscription({ channelConfig, token, socketId, channelName, fetch }) {
  const response = await fetchKchat({
    url: resolveKchatEchoAuthEndpoint(channelConfig),
    token,
    fetch,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        socket_id: socketId,
        channel_name: channelName,
      }),
    },
  });

  if (!response.ok) {
    throw new Error(`kChat WebSocket channel auth failed for ${channelName}: HTTP ${response.status}.`);
  }

  const auth = await response.json();
  if (!isRecord(auth) || !readOptionalString(auth.auth)) {
    throw new Error(`kChat WebSocket channel auth did not return a signature for ${channelName}.`);
  }

  return auth;
}

function resolveKchatEchoAuthEndpoint(channelConfig) {
  const configuredEndpoint = readOptionalString(channelConfig.websocketAuthEndpoint);
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  const baseUrl = resolveKchatApiBaseUrl(channelConfig);
  return `${baseUrl}/broadcasting/auth`;
}

function createKchatEchoSubscribeFrame(channelName, auth) {
  return {
    event: "pusher:subscribe",
    data: {
      channel: channelName,
      auth: auth.auth,
      ...(readOptionalString(auth.channel_data) ? { channel_data: auth.channel_data } : {}),
    },
  };
}

async function fetchKchatJson({ url, token, fetch }) {
  const response = await fetchKchat({ url, token, fetch });
  if (!response.ok) {
    throw new Error(`kChat API request failed: HTTP ${response.status}.`);
  }

  const parsed = await response.json();
  if (!isRecord(parsed)) {
    throw new Error("kChat API response did not return a JSON object.");
  }

  return parsed;
}

async function fetchKchat({ url, token, fetch, init = {} }) {
  const fetchImpl = fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required for kChat WebSocket receive mode.");
  }

  return await fetchImpl(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

function parseKchatEchoFrameData(value) {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readKchatWebSocketText(data) {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  return undefined;
}

function resolveKchatWebSocketMessageData(event) {
  if (isRecord(event) && "data" in event) {
    return event.data;
  }

  return event;
}

function parseKchatWebSocketPost(value) {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isKchatWebSocketAuthReply(frame) {
  return isRecord(frame) && readOptionalNumber(frame.seq_reply) === KCHAT_WEBSOCKET_AUTH_SEQ && typeof frame.status === "string";
}

function isAllowedKchatWebSocketChannel(payload, channelConfig) {
  const allowedChannelIds = readOptionalStringArray(channelConfig.websocketChannelIds) ?? [];
  if (allowedChannelIds.length === 0) {
    return true;
  }

  const channelId = readOptionalString(payload.channel_id) ?? readOptionalString(payload.channelId);
  return Boolean(channelId && allowedChannelIds.includes(channelId));
}

function addWebSocketListener(socket, eventName, handler) {
  if (typeof socket.addEventListener === "function") {
    socket.addEventListener(eventName, handler);
    return () => socket.removeEventListener?.(eventName, handler);
  }

  if (typeof socket.on === "function") {
    socket.on(eventName, handler);
    return () => {
      if (typeof socket.off === "function") {
        socket.off(eventName, handler);
      } else if (typeof socket.removeListener === "function") {
        socket.removeListener(eventName, handler);
      }
    };
  }

  const propertyName = `on${eventName}`;
  const previous = socket[propertyName];
  socket[propertyName] = handler;
  return () => {
    if (socket[propertyName] === handler) {
      socket[propertyName] = previous;
    }
  };
}

function closeKchatWebSocket(socket) {
  if (typeof socket.close === "function") {
    socket.close();
  }
}

function resolveKchatWebSocketError(event) {
  if (event instanceof Error) {
    return event;
  }

  const message = readOptionalString(event?.message) ?? readOptionalString(event?.error?.message) ?? "kChat WebSocket connection failed.";
  return new Error(message);
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
