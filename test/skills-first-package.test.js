import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChannelInboundEventContext } from "openclaw/plugin-sdk/channel-inbound";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const expectedToolNames = [
  "infomaniak_domains",
  "infomaniak_search",
  "infomaniak_describe",
  "infomaniak_discover",
  "infomaniak_mail_application",
  "infomaniak_workflow_list",
  "infomaniak_workflow_describe",
  "infomaniak_workflow_run",
  "infomaniak_call",
];
const expectedChannelIds = ["kchat"];
const websocketFixtureToken = "fixture";
const dangerousRuntimeImports = [
  ["node:child", "_process"].join(""),
  ["child", "_process"].join(""),
  "node:worker_threads",
  "worker_threads",
];

test("package declares a native OpenClaw plugin backed by the published liquid-potassium package", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const nativeManifest = JSON.parse(await readFile(join(repositoryRoot, "openclaw.plugin.json"), "utf8"));
  const codexManifest = JSON.parse(await readFile(join(repositoryRoot, ".codex-plugin", "plugin.json"), "utf8"));

  assert.equal(packageJson.private, undefined, "public bundle must not be marked private");
  assert.equal(packageJson.license, "Apache-2.0");
  assert.equal(packageJson.homepage, "https://github.com/OpenCow42/potassium-openclaw#readme");
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/OpenCow42/potassium-openclaw.git",
  });
  assert.deepEqual(packageJson.bugs, {
    url: "https://github.com/OpenCow42/potassium-openclaw/issues",
  });
  assert.equal(packageJson.publishConfig?.access, "public");
  assert.deepEqual(packageJson.files, [".codex-plugin", "openclaw.plugin.json", "index.js", "README.md", "LICENSE", "SECURITY.md", "docs", "skills"]);
  assert.deepEqual(packageJson.openclaw?.extensions, ["./index.js"]);
  assert.equal(packageJson.dependencies?.["liquid-potassium"], "0.3.0");
  assert.equal(packageJson.peerDependencies?.openclaw, ">=2026.6.6");

  assert.equal(nativeManifest.id, "potassium");
  assert.equal(nativeManifest.name, "Potassium");
  assert.deepEqual(nativeManifest.skills, ["./skills"]);
  assert.deepEqual(nativeManifest.channels, expectedChannelIds);
  assert.deepEqual(nativeManifest.channelEnvVars?.kchat, ["INFOMANIAK_TOKEN", "INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN"]);
  assert.deepEqual(nativeManifest.contracts?.tools, expectedToolNames);
  assert.equal("token" in nativeManifest.configSchema?.properties, false);
  assert.equal(nativeManifest.configSchema?.properties?.tokenEnvName?.default, "INFOMANIAK_TOKEN");
  assert.equal(nativeManifest.configSchema?.properties?.blockMutating?.default, true);
  assert.deepEqual(nativeManifest.setup?.providers?.[0]?.envVars, ["INFOMANIAK_TOKEN"]);
  assert.equal(nativeManifest.channelConfigs?.kchat?.label, "Infomaniak kChat");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.additionalProperties, false);
  assert.equal("token" in nativeManifest.channelConfigs?.kchat?.schema?.properties, false);
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.tokenEnvName?.default, "INFOMANIAK_TOKEN");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.teamName?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.apiBaseUrl?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.defaultChannel?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.setOnline?.type, "boolean");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.receiveMode?.default, "webhook");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketProtocol?.default, "infomaniak-echo");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.webhookPath?.default, "/channels/kchat/webhook");
  assert.equal(
    nativeManifest.channelConfigs?.kchat?.schema?.properties?.outgoingWebhookTokenEnvName?.default,
    "INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN",
  );
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.ignoredUserIds?.items?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.ignoredUserNames?.items?.type, "string");
  assert.deepEqual(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketChannelScope?.enum, ["all", "selected"]);
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketUrl?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketHost?.default, "websocket.kchat.infomaniak.com");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketAppKey?.default, "kchat-key");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketAuthEndpoint?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketSubscriptions?.items?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketTeamId?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketTeamUserId?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketChannelIds?.items?.type, "string");
  assert.equal(nativeManifest.channelConfigs?.kchat?.schema?.properties?.websocketDedupeWindowMs?.default, 120000);

  assert.equal(codexManifest.name, "potassium");
  assert.equal(codexManifest.license, "Apache-2.0");
  assert.equal(codexManifest.repository, "https://github.com/OpenCow42/potassium-openclaw");
  assert.equal(codexManifest.author?.name, "OpenCow");
  assert.equal(codexManifest.skills, "./skills/");
  assert.equal(codexManifest.interface?.displayName, "Potassium");
});

test("runtime entry registers exactly the manifest tool contracts", async () => {
  const pluginModule = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const plugin = pluginModule.default;
  const registeredTools = [];
  const registeredChannels = [];
  const registeredRoutes = [];

  assert.equal("token" in pluginModule.PotassiumPluginConfigJsonSchema.properties, false);
  assert.equal("token" in pluginModule.PotassiumKchatChannelConfigJsonSchema.properties, false);

  plugin.register({
    pluginConfig: { allowedDomains: ["kdrive"], tokenEnvName: "INFOMANIAK_TOKEN" },
    config: { channels: { kchat: { enabled: true } } },
    registerChannel(channel) {
      registeredChannels.push(channel);
    },
    registerHttpRoute(route) {
      registeredRoutes.push(route);
    },
    registerTool(tool) {
      registeredTools.push(tool);
    },
  });

  assert.equal(plugin.id, "potassium");
  assert.equal(plugin.name, "Potassium");
  assert.deepEqual(registeredTools.map((tool) => tool.name), expectedToolNames);
  assert.ok(registeredTools.every((tool) => tool.label && tool.description && tool.parameters));
  assert.deepEqual(registeredChannels.map(({ plugin: channelPlugin }) => channelPlugin.id), expectedChannelIds);

  const [kchatChannel] = registeredChannels.map(({ plugin: channelPlugin }) => channelPlugin);
  assert.equal(kchatChannel.meta.label, "Infomaniak kChat");
  assert.deepEqual(kchatChannel.capabilities.chatTypes, ["direct", "group", "channel", "thread"]);
  assert.equal(kchatChannel.message?.id, "kchat");
  assert.equal(kchatChannel.message?.send?.text instanceof Function, true);
  assert.deepEqual(kchatChannel.message?.durableFinal?.capabilities, {
    text: true,
    replyTo: true,
    thread: true,
  });
  assert.equal(kchatChannel.outbound?.deliveryMode, "direct");
  assert.equal(kchatChannel.outbound?.sendText instanceof Function, true);
  assert.equal(kchatChannel.gateway?.startAccount instanceof Function, true);
  assert.equal(kchatChannel.config.hasConfiguredState({ cfg: {}, env: { INFOMANIAK_TOKEN: "placeholder" } }), true);
  assert.equal(kchatChannel.config.hasConfiguredState({ cfg: {}, env: {} }), false);
  assert.deepEqual(
    registeredRoutes.map((route) => ({ path: route.path, auth: route.auth, match: route.match })),
    [{ path: "/channels/kchat/webhook", auth: "plugin", match: "exact" }],
  );
  assert.equal(registeredRoutes[0]?.handler instanceof Function, true);
});

test("runtime entry skips the webhook route when kChat receiveMode is websocket", async () => {
  const plugin = (await import(pathToFileURL(join(repositoryRoot, "index.js")).href)).default;
  const registeredRoutes = [];

  plugin.register({
    pluginConfig: { allowedDomains: ["kchat"], tokenEnvName: "INFOMANIAK_TOKEN" },
    config: { channels: { kchat: { enabled: true, receiveMode: "websocket" } } },
    registerChannel() {},
    registerHttpRoute(route) {
      registeredRoutes.push(route);
    },
    registerTool() {},
  });

  assert.deepEqual(registeredRoutes, []);
});

test("kChat outbound sends directly to id: destinations without channel lookup", async () => {
  const { createPotassiumKchatMessageAdapter } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const calls = [];
  const client = {
    kchat: {
      async getchannelbynameforteamname(request) {
        calls.push(["lookup", request]);
        throw new Error("id: destinations must not resolve channel names");
      },
      async createpost(request) {
        calls.push(["createpost", request]);
        return { id: "post-123", channel_id: "channel-123", create_at: 1710000000000 };
      },
    },
  };
  const adapter = createPotassiumKchatMessageAdapter({ client });

  const result = await adapter.send.text({
    cfg: { channels: { kchat: { teamName: "main-team" } } },
    to: "id:channel-123",
    text: "hello from tests",
    replyToId: "root-from-reply",
  });

  assert.deepEqual(calls, [
    [
      "createpost",
      {
        body: {
          channel_id: "channel-123",
          message: "hello from tests",
          root_id: "root-from-reply",
        },
      },
    ],
  ]);
  assert.equal(result.messageId, "post-123");
  assert.equal(result.receipt.primaryPlatformMessageId, "post-123");
  assert.equal(result.receipt.replyToId, "root-from-reply");
  assert.deepEqual(result.providerResult, { id: "post-123", channel_id: "channel-123", create_at: 1710000000000 });
});

test("kChat outbound resolves #channel destinations before creating posts", async () => {
  const { createPotassiumKchatMessageAdapter } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const calls = [];
  const client = {
    kchat: {
      async getchannelbynameforteamname(request) {
        calls.push(["lookup", request]);
        return { id: "alerts-channel-id", name: "alerts" };
      },
      async createpost(request) {
        calls.push(["createpost", request]);
        return { id: "post-456", channel_id: "alerts-channel-id" };
      },
    },
  };
  const adapter = createPotassiumKchatMessageAdapter({ client });

  const result = await adapter.send.text({
    cfg: { channels: { kchat: { teamName: "main-team", setOnline: false } } },
    to: "#alerts",
    text: "threaded update",
    threadId: "thread-root",
    replyToId: "reply-ignored-when-thread-exists",
  });

  assert.deepEqual(calls, [
    [
      "lookup",
      {
        path: {
          team_name: "main-team",
          channel_name: "alerts",
        },
      },
    ],
    [
      "createpost",
      {
        body: {
          channel_id: "alerts-channel-id",
          message: "threaded update",
          root_id: "thread-root",
        },
        query: {
          set_online: false,
        },
      },
    ],
  ]);
  assert.equal(result.messageId, "post-456");
  assert.equal(result.receipt.threadId, "thread-root");
  assert.equal(result.receipt.replyToId, "reply-ignored-when-thread-exists");
});

test("kChat outbound works with the published liquid-potassium client shape", async () => {
  const { sendKchatText } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const tokenEnvName = "POTASSIUM_TEST_INFOMANIAK_TOKEN";
  const originalToken = process.env[tokenEnvName];
  const requests = [];

  process.env[tokenEnvName] = "placeholder-token";
  try {
    var result = await sendKchatText(
      {
        cfg: { channels: { kchat: { teamName: "main-team", tokenEnvName, setOnline: false } } },
        to: "#alerts",
        text: "published client shape",
      },
      {
        fetch: async (url, init) => {
          requests.push({
            url: String(url),
            method: init.method,
            body: init.body,
          });
          if (String(url).includes("/teams/name/main-team/channels/name/alerts")) {
            return jsonResponse({ id: "alerts-channel-id", name: "alerts" });
          }

          return jsonResponse({ id: "post-from-real-client-shape", channel_id: "alerts-channel-id" });
        },
      },
    );
  } finally {
    if (originalToken === undefined) {
      delete process.env[tokenEnvName];
    } else {
      process.env[tokenEnvName] = originalToken;
    }
  }

  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].url, "https://main-team.kchat.infomaniak.com/api/v4/teams/name/main-team/channels/name/alerts");
  assert.equal(requests[1].method, "POST");
  assert.equal(requests[1].url, "https://main-team.kchat.infomaniak.com/api/v4/posts?set_online=false");
  assert.deepEqual(JSON.parse(requests[1].body), {
    channel_id: "alerts-channel-id",
    message: "published client shape",
  });
  assert.equal(result.messageId, "post-from-real-client-shape");
});

test("kChat inbound webhook dispatches valid JSON payloads through the channel runtime", async () => {
  const { createPotassiumKchatWebhookHandler } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const inboundRuns = [];
  const routeCalls = [];
  const contextCalls = [];
  const handler = createPotassiumKchatWebhookHandler({
    cfg: { channels: { kchat: { enabled: true } } },
    channelConfig: {},
    env: { INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN: "expected-placeholder" },
    runtime: createKchatRuntimeStub({ inboundRuns, routeCalls, contextCalls }),
  });

  const response = await invokeWebhookHandler(handler, {
    contentType: "application/json",
    body: JSON.stringify({
      token: "expected-placeholder",
      channel_id: "channel-123",
      channel_name: "general",
      team_domain: "main",
      team_id: "team-123",
      post_id: "post-123",
      root_id: "root-123",
      user_id: "user-123",
      user_name: "alice",
      text: "hello from kChat",
      timestamp: "1710000000",
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true, status: "dispatched" });
  assert.equal(inboundRuns.length, 1);
  assert.equal(inboundRuns[0].channel, "kchat");
  assert.equal(inboundRuns[0].accountId, "default");
  assert.equal(inboundRuns[0].raw.token, "[redacted]");
  assert.equal(inboundRuns[0].raw.text, "hello from kChat");

  const input = inboundRuns[0].adapter.ingest();
  assert.deepEqual(input, {
    id: "post-123",
    timestamp: 1710000000000,
    rawText: "hello from kChat",
    textForAgent: "hello from kChat",
    textForCommands: "hello from kChat",
    raw: inboundRuns[0].raw,
  });

  const turn = await inboundRuns[0].adapter.resolveTurn(input);
  assert.equal(turn.channel, "kchat");
  assert.equal(turn.accountId, "default");
  assert.equal(turn.agentId, "agent-123");
  assert.equal(turn.routeSessionKey, "session-channel-123");
  assert.equal(turn.storePath, "/tmp/openclaw-test/agent-123");
  assert.equal(turn.ctxPayload.conversation.id, "channel-123");
  assert.equal(turn.ctxPayload.conversation.label, "main/general");
  assert.equal(turn.ctxPayload.conversation.threadId, "root-123");
  assert.equal(turn.ctxPayload.conversation.nativeChannelId, "channel-123");
  assert.equal(turn.ctxPayload.route.routeSessionKey, "session-channel-123");
  assert.equal(turn.ctxPayload.route.dispatchSessionKey, "session-channel-123:thread:root-123");
  assert.equal(turn.ctxPayload.route.parentSessionKey, "session-channel-123");
  assert.equal(turn.ctxPayload.reply.to, "id:channel-123");
  assert.equal(turn.ctxPayload.reply.messageThreadId, "root-123");
  assert.equal(turn.ctxPayload.reply.replyToId, "root-123");
  assert.equal(turn.ctxPayload.reply.nativeChannelId, "channel-123");
  assert.equal(turn.ctxPayload.reply.sourceReplyDeliveryMode, "thread");
  assert.equal(turn.ctxPayload.message.bodyForAgent, "hello from kChat");
  assert.deepEqual(turn.delivery.durable({ text: "agent reply" }, { kind: "final" }), {
    to: "id:channel-123",
    threadId: "root-123",
    replyToId: "root-123",
    requiredCapabilities: { text: true, replyTo: true, thread: true },
  });
  assert.deepEqual(turn.record.updateLastRoute, {
    sessionKey: "session-channel-123:thread:root-123",
    channel: "kchat",
    to: "id:channel-123",
    accountId: "default",
    threadId: "root-123",
  });
  assert.deepEqual(routeCalls[0].peer, { kind: "channel", id: "channel-123" });
  assert.equal(contextCalls.length, 1);
});

test("kChat inbound root posts reply in a thread under the original post", async () => {
  const { dispatchKchatInboundWebhookEvent, normalizeKchatOutgoingWebhookPayload } = await import(
    pathToFileURL(join(repositoryRoot, "index.js")).href
  );
  const inboundRuns = [];
  const routeCalls = [];
  const inbound = normalizeKchatOutgoingWebhookPayload({
    channel_id: "question-channel",
    channel_name: "questions",
    team_domain: "main",
    team_id: "team-123",
    post_id: "root-post-123",
    user_id: "user-123",
    user_name: "alice",
    text: "root question",
  });

  await dispatchKchatInboundWebhookEvent({
    cfg: { channels: { kchat: { defaultChannel: "id:wrong-default-channel" } } },
    channelConfig: { defaultChannel: "id:wrong-default-channel" },
    runtime: createKchatRuntimeStub({ inboundRuns, routeCalls, realContext: true }),
    inbound,
  });

  const turn = await inboundRuns[0].adapter.resolveTurn(inboundRuns[0].adapter.ingest());
  assert.equal(turn.ctxPayload.To, "id:question-channel");
  assert.equal(turn.ctxPayload.OriginatingTo, "id:question-channel");
  assert.equal(turn.ctxPayload.NativeChannelId, "question-channel");
  assert.equal(turn.ctxPayload.MessageThreadId, "root-post-123");
  assert.equal(turn.ctxPayload.ReplyToId, "root-post-123");
  assert.equal(turn.ctxPayload.SessionKey, "session-question-channel:thread:root-post-123");
  assert.equal(turn.ctxPayload.ParentSessionKey, "session-question-channel");
  assert.deepEqual(turn.delivery.durable({ text: "agent reply" }, { kind: "final" }), {
    to: "id:question-channel",
    threadId: "root-post-123",
    replyToId: "root-post-123",
    requiredCapabilities: { text: true, replyTo: true, thread: true },
  });
  assert.deepEqual(routeCalls[0].peer, { kind: "channel", id: "question-channel" });
});

test("kChat inbound channel_id overrides configured defaultChannel for replies", async () => {
  const { dispatchKchatInboundWebhookEvent, normalizeKchatOutgoingWebhookPayload } = await import(
    pathToFileURL(join(repositoryRoot, "index.js")).href
  );
  const inboundRuns = [];
  const inbound = normalizeKchatOutgoingWebhookPayload({
    channel_id: "actual-inbound-channel",
    channel_name: "actual",
    team_domain: "main",
    post_id: "actual-post",
    user_name: "alice",
    text: "use this channel",
  });

  await dispatchKchatInboundWebhookEvent({
    cfg: { channels: { kchat: { defaultChannel: "id:configured-default-channel" } } },
    channelConfig: { defaultChannel: "id:configured-default-channel" },
    runtime: createKchatRuntimeStub({ inboundRuns, realContext: true }),
    inbound,
  });

  const turn = await inboundRuns[0].adapter.resolveTurn(inboundRuns[0].adapter.ingest());
  assert.equal(turn.ctxPayload.To, "id:actual-inbound-channel");
  assert.equal(turn.ctxPayload.OriginatingTo, "id:actual-inbound-channel");
  assert.equal(turn.ctxPayload.NativeChannelId, "actual-inbound-channel");
  assert.equal(turn.ctxPayload.MessageThreadId, "actual-post");
  assert.equal(turn.ctxPayload.ReplyToId, "actual-post");
  assert.equal(turn.delivery.durable({ text: "reply" }, { kind: "final" }).to, "id:actual-inbound-channel");
});

test("kChat inbound without channel_id fails safely instead of using defaultChannel", async () => {
  const {
    createPotassiumKchatWebhookHandler,
    dispatchKchatInboundWebhookEvent,
    normalizeKchatOutgoingWebhookPayload,
    sendKchatText,
  } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const inboundRuns = [];
  const routeCalls = [];
  const inbound = normalizeKchatOutgoingWebhookPayload({
    channel_name: "general",
    team_domain: "main",
    post_id: "post-without-channel-id",
    user_name: "alice",
    text: "ambiguous inbound",
  });

  await dispatchKchatInboundWebhookEvent({
    cfg: { channels: { kchat: { defaultChannel: "id:configured-default-channel" } } },
    channelConfig: { defaultChannel: "id:configured-default-channel", teamName: "main" },
    runtime: createKchatRuntimeStub({ inboundRuns, routeCalls }),
    inbound,
  });

  assert.throws(
    () => inboundRuns[0].adapter.resolveTurn(inboundRuns[0].adapter.ingest()),
    /did not include channel_id/,
  );
  assert.equal(routeCalls.length, 0);

  const handlerRuns = [];
  const handlerRouteCalls = [];
  const handlerRuntime = createKchatRuntimeStub({ inboundRuns: handlerRuns, routeCalls: handlerRouteCalls });
  handlerRuntime.channel.inbound.run = async (params) => {
    handlerRuns.push(params);
    params.adapter.resolveTurn(params.adapter.ingest());
  };
  const handler = createPotassiumKchatWebhookHandler({
    cfg: { channels: { kchat: { defaultChannel: "id:configured-default-channel" } } },
    channelConfig: { defaultChannel: "id:configured-default-channel", teamName: "main" },
    env: { INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN: "expected-placeholder" },
    runtime: handlerRuntime,
  });
  const response = await invokeWebhookHandler(handler, {
    contentType: "application/json",
    body: JSON.stringify({
      ["to" + "ken"]: "expected-placeholder",
      channel_name: "general",
      team_domain: "main",
      post_id: "post-without-channel-id",
      user_name: "alice",
      text: "ambiguous inbound",
    }),
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: "missing_reply_channel" });
  assert.equal(handlerRouteCalls.length, 0);

  const calls = [];
  const result = await sendKchatText(
    {
      cfg: { channels: { kchat: { defaultChannel: "id:configured-default-channel" } } },
      text: "explicit outbound default",
    },
    {
      client: {
        kchat: {
          async createpost(request) {
            calls.push(request);
            return { id: "outbound-post", channel_id: "configured-default-channel" };
          },
        },
      },
    },
  );

  assert.equal(result.messageId, "outbound-post");
  assert.deepEqual(calls, [
    {
      body: {
        channel_id: "configured-default-channel",
        message: "explicit outbound default",
      },
    },
  ]);
});

test("kChat inbound webhook rejects invalid tokens without dispatching", async () => {
  const { createPotassiumKchatWebhookHandler } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const calls = [];
  const handler = createPotassiumKchatWebhookHandler({
    cfg: { channels: { kchat: { enabled: true } } },
    channelConfig: {},
    env: { INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN: "expected-placeholder" },
    runtime: {
      channel: {
        inbound: {
          async run(params) {
            calls.push(params);
          },
        },
      },
    },
  });

  const response = await invokeWebhookHandler(handler, {
    contentType: "application/json",
    body: JSON.stringify({
      token: "wrong-placeholder",
      channel_id: "channel-123",
      post_id: "post-123",
      user_id: "user-123",
      text: "hello from kChat",
    }),
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { ok: false, error: "invalid_token" });
  assert.equal(calls.length, 0);
});

test("kChat inbound webhook drops ignored users without dispatching", async () => {
  const { createPotassiumKchatWebhookHandler } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const calls = [];
  const handler = createPotassiumKchatWebhookHandler({
    cfg: { channels: { kchat: { ignoredUserIds: ["bot-user"] } } },
    channelConfig: { ignoredUserIds: ["bot-user"] },
    env: { INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN: "expected-placeholder" },
    runtime: {
      channel: {
        inbound: {
          async run(params) {
            calls.push(params);
          },
        },
      },
    },
  });

  const response = await invokeWebhookHandler(handler, {
    contentType: "application/json",
    body: JSON.stringify({
      token: "expected-placeholder",
      channel_id: "channel-123",
      post_id: "post-123",
      user_id: "bot-user",
      user_name: "api-poster",
      text: "loop candidate",
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true, status: "dropped" });
  assert.equal(calls.length, 0);
});

test("kChat inbound webhook parses form and payload-wrapped bodies", async () => {
  const { createPotassiumKchatWebhookHandler, parseKchatWebhookBody } = await import(
    pathToFileURL(join(repositoryRoot, "index.js")).href
  );
  const calls = [];
  const handler = createPotassiumKchatWebhookHandler({
    cfg: { channels: { kchat: { enabled: true } } },
    channelConfig: {},
    env: { INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN: "expected-placeholder" },
    runtime: {
      channel: {
        inbound: {
          async run(params) {
            calls.push(params);
          },
        },
      },
    },
  });

  const form = new URLSearchParams({
    token: "expected-placeholder",
    channel_id: "channel-123",
    post_id: "post-123",
    user_name: "alice",
    text: "plain form",
  });
  const formResponse = await invokeWebhookHandler(handler, {
    contentType: "application/x-www-form-urlencoded",
    body: form.toString(),
  });

  const nested = parseKchatWebhookBody(
    new URLSearchParams({
      payload: JSON.stringify({
        token: "expected-placeholder",
        channel_id: "channel-456",
        post_id: "post-456",
        user_name: "bob",
        text: "nested form",
      }),
    }).toString(),
    "application/x-www-form-urlencoded",
  );

  assert.equal(formResponse.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].raw.text, "plain form");
  assert.equal(nested.channel_id, "channel-456");
  assert.equal(nested.text, "nested form");
});

test("kChat inbound normalization preserves thread context and redacts tokens", async () => {
  const { normalizeKchatOutgoingWebhookPayload } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);

  const normalized = normalizeKchatOutgoingWebhookPayload({
    token: "placeholder-token",
    channel_name: "alerts",
    team_domain: "main",
    post_id: "post-789",
    rootId: "root-789",
    userName: "charlie",
    text: "threaded inbound",
    timestamp: 1710000000,
  });

  assert.equal(normalized.id, "post-789");
  assert.equal(normalized.rootId, "root-789");
  assert.equal(normalized.conversationId, "main/alerts");
  assert.equal(normalized.timestamp, 1710000000000);
  assert.equal(normalized.sender.username, "charlie");
  assert.equal(normalized.raw.token, "[redacted]");
});

test("kChat WebSocket helpers derive URLs and normalize posted events", async () => {
  const {
    createKchatWebSocketAuthFrame,
    dispatchKchatWebSocketEvent,
    normalizeKchatWebSocketPostEvent,
    resolveKchatWebSocketUrl,
  } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const inboundRuns = [];

  assert.equal(
    resolveKchatWebSocketUrl({ teamName: "main-team" }),
    "wss://websocket.kchat.infomaniak.com/app/kchat-key?protocol=7&client=liquid-potassium&version=0.3.0&flash=false",
  );
  assert.equal(
    resolveKchatWebSocketUrl({ websocketProtocol: "mattermost", apiBaseUrl: "http://localhost:8065/custom/path?ignored=true" }),
    "ws://localhost:8065/api/v4/websocket",
  );
  assert.deepEqual(createKchatWebSocketAuthFrame("placeholder-token"), {
    seq: 1,
    action: "authentication_challenge",
    data: {
      token: "placeholder-token",
    },
  });

  const frame = {
    event: "posted",
    data: {
      channel_name: "test",
      sender_name: "alice",
      post: JSON.stringify({
        id: "post-ws-123",
        channel_id: "channel-123",
        user_id: "user-123",
        message: "hello over websocket",
        create_at: 1710000000000,
      }),
    },
    broadcast: {
      team_id: "team-123",
    },
    seq: 2,
  };

  assert.deepEqual(normalizeKchatWebSocketPostEvent(frame, { teamName: "main-team" }), {
    channel_id: "channel-123",
    channel_name: "test",
    team_domain: "main-team",
    team_id: "team-123",
    post_id: "post-ws-123",
    user_id: "user-123",
    user_name: "alice",
    text: "hello over websocket",
    create_at: 1710000000000,
  });

  assert.deepEqual(
    await dispatchKchatWebSocketEvent({
      cfg: { channels: { kchat: { teamName: "main-team", websocketChannelIds: ["other-channel"] } } },
      channelConfig: { teamName: "main-team", websocketChannelIds: ["other-channel"] },
      runtime: createKchatRuntimeStub({ inboundRuns }),
      frame,
    }),
    {
      dispatched: false,
      reason: "channel_not_allowed",
      postId: "post-ws-123",
      channelId: "channel-123",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
  );
  assert.equal(inboundRuns.length, 0);

  assert.deepEqual(
    await dispatchKchatWebSocketEvent({
      cfg: { channels: { kchat: { teamName: "main-team", websocketChannelScope: "all", websocketChannelIds: ["other-channel"] } } },
      channelConfig: { teamName: "main-team", websocketChannelScope: "all", websocketChannelIds: ["other-channel"] },
      runtime: createKchatRuntimeStub({ inboundRuns }),
      frame,
    }),
    {
      dispatched: true,
      inboundId: "post-ws-123",
      postId: "post-ws-123",
      channelId: "channel-123",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
  );
  assert.equal(inboundRuns.length, 1);

  assert.deepEqual(
    await dispatchKchatWebSocketEvent({
      cfg: { channels: { kchat: { teamName: "main-team", ignoredUserIds: ["user-123"] } } },
      channelConfig: { teamName: "main-team", ignoredUserIds: ["user-123"] },
      runtime: createKchatRuntimeStub({ inboundRuns }),
      frame,
    }),
    {
      dispatched: false,
      reason: "ignored_sender",
      postId: "post-ws-123",
      channelId: "channel-123",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
  );
  assert.equal(inboundRuns.length, 1);

  const missingChannelFrame = {
    event: "posted",
    data: {
      channel_name: "test",
      sender_name: "alice",
      post: JSON.stringify({
        id: "post-ws-missing-channel",
        user_id: "user-123",
        message: "missing channel id",
        create_at: 1710000000000,
      }),
    },
    broadcast: {
      team_id: "team-123",
    },
    seq: 3,
  };
  assert.deepEqual(
    await dispatchKchatWebSocketEvent({
      cfg: { channels: { kchat: { teamName: "main-team", defaultChannel: "id:configured-default-channel" } } },
      channelConfig: { teamName: "main-team", defaultChannel: "id:configured-default-channel" },
      runtime: createKchatRuntimeStub({ inboundRuns }),
      frame: missingChannelFrame,
    }),
    {
      dispatched: false,
      reason: "missing_reply_channel",
      postId: "post-ws-missing-channel",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
  );
  assert.equal(inboundRuns.length, 1);

  const dedupeState = new Map();
  const duplicateRuns = [];
  assert.equal(
    (
      await dispatchKchatWebSocketEvent({
        cfg: { channels: { kchat: { teamName: "main-team" } } },
        channelConfig: { teamName: "main-team" },
        runtime: createKchatRuntimeStub({ inboundRuns: duplicateRuns }),
        frame,
        dedupeState,
      })
    ).dispatched,
    true,
  );
  assert.deepEqual(
    await dispatchKchatWebSocketEvent({
      cfg: { channels: { kchat: { teamName: "main-team" } } },
      channelConfig: { teamName: "main-team" },
      runtime: createKchatRuntimeStub({ inboundRuns: duplicateRuns }),
      frame,
      dedupeState,
    }),
    {
      dispatched: false,
      reason: "duplicate_post",
      postId: "post-ws-123",
      channelId: "channel-123",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
  );
  assert.equal(duplicateRuns.length, 1);

  const noDedupeRuns = [];
  const noDedupeState = new Map();
  assert.equal(
    (
      await dispatchKchatWebSocketEvent({
        cfg: { channels: { kchat: { teamName: "main-team", websocketDedupeWindowMs: 0 } } },
        channelConfig: { teamName: "main-team", websocketDedupeWindowMs: 0 },
        runtime: createKchatRuntimeStub({ inboundRuns: noDedupeRuns }),
        frame,
        dedupeState: noDedupeState,
      })
    ).dispatched,
    true,
  );
  assert.equal(
    (
      await dispatchKchatWebSocketEvent({
        cfg: { channels: { kchat: { teamName: "main-team", websocketDedupeWindowMs: 0 } } },
        channelConfig: { teamName: "main-team", websocketDedupeWindowMs: 0 },
        runtime: createKchatRuntimeStub({ inboundRuns: noDedupeRuns }),
        frame,
        dedupeState: noDedupeState,
      })
    ).dispatched,
    true,
  );
  assert.equal(noDedupeRuns.length, 2);
});

test("kChat WebSocket inbound reply context preserves channel and thread roots", async () => {
  const { dispatchKchatWebSocketEvent } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);

  const threadedRuns = [];
  const threadedFrame = {
    event: "posted",
    data: {
      channel_name: "support",
      sender_name: "alice",
      post: JSON.stringify({
        id: "reply-post-123",
        root_id: "thread-root-123",
        channel_id: "actual-support-channel",
        user_id: "user-123",
        message: "question in existing thread",
        create_at: 1710000000000,
      }),
    },
    broadcast: {
      team_id: "team-123",
    },
    seq: 4,
  };
  assert.equal(
    (
      await dispatchKchatWebSocketEvent({
        cfg: { channels: { kchat: { teamName: "main-team", defaultChannel: "id:wrong-default-channel" } } },
        channelConfig: { teamName: "main-team", defaultChannel: "id:wrong-default-channel" },
        runtime: createKchatRuntimeStub({ inboundRuns: threadedRuns, realContext: true }),
        frame: threadedFrame,
      })
    ).dispatched,
    true,
  );
  const threadedTurn = await threadedRuns[0].adapter.resolveTurn(threadedRuns[0].adapter.ingest());
  assert.equal(threadedTurn.ctxPayload.To, "id:actual-support-channel");
  assert.equal(threadedTurn.ctxPayload.NativeChannelId, "actual-support-channel");
  assert.equal(threadedTurn.ctxPayload.MessageThreadId, "thread-root-123");
  assert.equal(threadedTurn.ctxPayload.ReplyToId, "thread-root-123");
  assert.equal(threadedTurn.ctxPayload.SessionKey, "session-actual-support-channel:thread:thread-root-123");
  assert.deepEqual(threadedTurn.delivery.durable({ text: "agent reply" }, { kind: "final" }), {
    to: "id:actual-support-channel",
    threadId: "thread-root-123",
    replyToId: "thread-root-123",
    requiredCapabilities: { text: true, replyTo: true, thread: true },
  });

  const rootRuns = [];
  const rootFrame = {
    event: "posted",
    data: {
      channel_name: "support",
      sender_name: "alice",
      post: JSON.stringify({
        id: "root-post-456",
        channel_id: "actual-support-channel",
        user_id: "user-123",
        message: "new root question",
        create_at: 1710000000000,
      }),
    },
    broadcast: {
      team_id: "team-123",
    },
    seq: 5,
  };
  assert.equal(
    (
      await dispatchKchatWebSocketEvent({
        cfg: { channels: { kchat: { teamName: "main-team", defaultChannel: "id:wrong-default-channel" } } },
        channelConfig: { teamName: "main-team", defaultChannel: "id:wrong-default-channel" },
        runtime: createKchatRuntimeStub({ inboundRuns: rootRuns, realContext: true }),
        frame: rootFrame,
      })
    ).dispatched,
    true,
  );
  const rootTurn = await rootRuns[0].adapter.resolveTurn(rootRuns[0].adapter.ingest());
  assert.equal(rootTurn.ctxPayload.To, "id:actual-support-channel");
  assert.equal(rootTurn.ctxPayload.NativeChannelId, "actual-support-channel");
  assert.equal(rootTurn.ctxPayload.MessageThreadId, "root-post-456");
  assert.equal(rootTurn.ctxPayload.ReplyToId, "root-post-456");
  assert.equal(rootTurn.ctxPayload.SessionKey, "session-actual-support-channel:thread:root-post-456");
  assert.deepEqual(rootTurn.delivery.durable({ text: "agent reply" }, { kind: "final" }), {
    to: "id:actual-support-channel",
    threadId: "root-post-456",
    replyToId: "root-post-456",
    requiredCapabilities: { text: true, replyTo: true, thread: true },
  });
});

test("kChat WebSocket connection authenticates and dispatches posted events", async () => {
  const { runKchatWebSocketConnection } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const inboundRuns = [];
  const dispatchResults = [];
  const debugLogs = [];
  const abortController = new AbortController();
  MockWebSocket.instances = [];

  await assert.rejects(
    runKchatWebSocketConnection({
      cfg: { channels: { kchat: { teamName: "main-team", websocketChannelScope: "selected" } } },
      channelConfig: { teamName: "main-team", websocketChannelScope: "selected" },
      token: websocketFixtureToken,
      WebSocketImpl: MockWebSocket,
    }),
    /websocketChannelScope="selected" requires/,
  );

  const connection = runKchatWebSocketConnection({
    cfg: { channels: { kchat: { teamName: "main-team", websocketProtocol: "mattermost", websocketChannelIds: ["channel-123"], ignoredUserIds: ["ignored-user"] } } },
    channelConfig: { teamName: "main-team", websocketProtocol: "mattermost", websocketChannelIds: ["channel-123"], ignoredUserIds: ["ignored-user"] },
    token: "placeholder-token",
    WebSocketImpl: MockWebSocket,
    runtime: createKchatRuntimeStub({ inboundRuns }),
    abortSignal: abortController.signal,
    log: {
      debug(message) {
        debugLogs.push(message);
      },
    },
    onDispatchResult(result) {
      dispatchResults.push(result);
    },
  });

  await waitImmediate();
  const socket = MockWebSocket.instances[0];
  assert.equal(socket.url, "wss://main-team.kchat.infomaniak.com/api/v4/websocket");
  assert.deepEqual(JSON.parse(socket.sent[0]), {
    seq: 1,
    action: "authentication_challenge",
    data: {
      token: "placeholder-token",
    },
  });

  socket.emitMessage(
    JSON.stringify({
      status: "OK",
      seq_reply: 1,
    }),
  );
  socket.emitMessage(
    JSON.stringify({
      event: "posted",
      data: {
        channel_name: "other",
        sender_name: "alice",
        post: JSON.stringify({
          id: "post-ws-ignored",
          channel_id: "other-channel",
          user_id: "user-123",
          message: "this text must not be logged",
          create_at: 1710000000000,
        }),
      },
      broadcast: {
        team_id: "team-123",
      },
      seq: 2,
    }),
  );
  socket.emitMessage(
    JSON.stringify({
      event: "posted",
      data: {
        channel_name: "test",
        sender_name: "bob",
        post: JSON.stringify({
          id: "post-ws-ignored-sender",
          channel_id: "channel-123",
          user_id: "ignored-user",
          message: "ignored sender text must not be logged",
          create_at: 1710000000000,
        }),
      },
      broadcast: {
        team_id: "team-123",
      },
      seq: 2,
    }),
  );
  socket.emitMessage(
    JSON.stringify({
      event: "posted",
      data: {
        channel_name: "test",
        sender_name: "alice",
        post: JSON.stringify({
          id: "post-ws-456",
          channel_id: "channel-123",
          user_id: "user-123",
          message: "ping from websocket",
          create_at: 1710000000000,
        }),
      },
      broadcast: {
        team_id: "team-123",
      },
      seq: 2,
    }),
  );
  await waitImmediate();

  assert.equal(inboundRuns.length, 1);
  assert.equal(inboundRuns[0].raw.text, "ping from websocket");
  assert.equal(inboundRuns[0].raw.post_id, "post-ws-456");
  assert.deepEqual(dispatchResults, [
    {
      dispatched: false,
      reason: "channel_not_allowed",
      postId: "post-ws-ignored",
      channelId: "other-channel",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
    {
      dispatched: false,
      reason: "ignored_sender",
      postId: "post-ws-ignored-sender",
      channelId: "channel-123",
      teamId: "team-123",
      userId: "ignored-user",
      userName: "bob",
    },
    {
      dispatched: true,
      inboundId: "post-ws-456",
      postId: "post-ws-456",
      channelId: "channel-123",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
  ]);
  assert.match(debugLogs.join("\n"), /reason=channel_not_allowed/);
  assert.match(debugLogs.join("\n"), /reason=ignored_sender/);
  assert.match(debugLogs.join("\n"), /postId=post-ws-ignored/);
  assert.equal(debugLogs.join("\n").includes("this text must not be logged"), false);
  assert.equal(debugLogs.join("\n").includes("ignored sender text must not be logged"), false);

  abortController.abort();
  await connection;
  assert.equal(socket.closed, true);
});

test("kChat Infomaniak Echo WebSocket subscribes and dispatches posted events", async () => {
  const { runKchatWebSocketConnection } = await import(pathToFileURL(join(repositoryRoot, "index.js")).href);
  const inboundRuns = [];
  const dispatchResults = [];
  const fetchCalls = [];
  const abortController = new AbortController();
  MockWebSocket.instances = [];

  const fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), method: init.method ?? "GET", body: String(init.body ?? "") });
    if (String(url).endsWith("/api/v4/teams/name/main-team")) {
      return jsonResponse({ id: "team-123", name: "main-team" });
    }
    if (String(url).endsWith("/api/v4/users/me")) {
      return jsonResponse({ id: "user-self", username: "bot-user" });
    }
    if (String(url).endsWith("/broadcasting/auth")) {
      const body = new URLSearchParams(String(init.body ?? ""));
      return jsonResponse({
        auth: `kchat-key:${body.get("channel_name")}-signature`,
        ...(body.get("channel_name")?.startsWith("presence-") ? { channel_data: JSON.stringify({ user_id: "user-self" }) } : {}),
      });
    }

    throw new Error(`unexpected fetch ${url}`);
  };

  const connection = runKchatWebSocketConnection({
    cfg: { channels: { kchat: { teamName: "main-team", websocketChannelIds: ["channel-123"] } } },
    channelConfig: { teamName: "main-team", websocketChannelIds: ["channel-123"] },
    token: "placeholder-token",
    WebSocketImpl: MockWebSocket,
    fetch,
    runtime: createKchatRuntimeStub({ inboundRuns }),
    abortSignal: abortController.signal,
    onDispatchResult(result) {
      dispatchResults.push(result);
    },
  });

  await waitImmediate();
  const socket = MockWebSocket.instances[0];
  assert.equal(
    socket.url,
    "wss://websocket.kchat.infomaniak.com/app/kchat-key?protocol=7&client=liquid-potassium&version=0.3.0&flash=false",
  );

  socket.emitMessage(
    JSON.stringify({
      event: "pusher:connection_established",
      data: JSON.stringify({
        socket_id: "1234.5678",
        activity_timeout: 30,
      }),
    }),
  );
  await waitImmediate();
  await waitImmediate();

  assert.deepEqual(fetchCalls.map((call) => [call.method, call.url]), [
    ["GET", "https://main-team.kchat.infomaniak.com/api/v4/teams/name/main-team"],
    ["GET", "https://main-team.kchat.infomaniak.com/api/v4/users/me"],
    ["POST", "https://main-team.kchat.infomaniak.com/broadcasting/auth"],
    ["POST", "https://main-team.kchat.infomaniak.com/broadcasting/auth"],
  ]);
  assert.deepEqual(
    socket.sent.map((value) => JSON.parse(value).data.channel),
    ["private-team.team-123", "presence-teamUser.user-self"],
  );

  socket.emitMessage(
    JSON.stringify({
      event: "pusher_internal:subscription_succeeded",
      channel: "presence-teamUser.user-self",
      data: JSON.stringify({ presence: {} }),
    }),
  );
  socket.emitMessage(
    JSON.stringify({
      event: "posted",
      channel: "presence-teamUser.user-self",
      data: JSON.stringify({
        channel_name: "test",
        sender_name: "alice",
        team_id: "team-123",
        channel_id: "channel-123",
        post: JSON.stringify({
          id: "post-echo-123",
          channel_id: "channel-123",
          user_id: "user-123",
          message: "ping from echo",
          create_at: 1710000000000,
        }),
      }),
    }),
  );
  await waitImmediate();

  assert.equal(inboundRuns.length, 1);
  assert.equal(inboundRuns[0].raw.text, "ping from echo");
  assert.equal(inboundRuns[0].raw.post_id, "post-echo-123");
  assert.deepEqual(dispatchResults, [
    {
      dispatched: true,
      inboundId: "post-echo-123",
      postId: "post-echo-123",
      channelId: "channel-123",
      teamId: "team-123",
      userId: "user-123",
      userName: "alice",
    },
  ]);

  abortController.abort();
  await connection;
  assert.equal(socket.closed, true);
});

test("runtime entry rejects direct bearer-token config", async () => {
  const plugin = (await import(pathToFileURL(join(repositoryRoot, "index.js")).href)).default;

  assert.throws(
    () =>
      plugin.register({
        pluginConfig: { token: "placeholder" },
        registerTool() {},
      }),
    /Direct Infomaniak token config is disabled/,
  );
});

test("shipped JavaScript files do not import process-spawning APIs", async () => {
  const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  const files = await listPackagedJavaScriptFiles(packageJson.files);

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    for (const dangerousImport of dangerousRuntimeImports) {
      assert.equal(
        source.includes(dangerousImport),
        false,
        `${relative(repositoryRoot, filePath)} must not reference ${dangerousImport}`,
      );
    }
  }
});

async function listPackagedJavaScriptFiles(entries) {
  const files = [];

  for (const entry of entries) {
    const path = join(repositoryRoot, entry);
    await collectJavaScriptFiles(path, files);
  }

  return files;
}

async function collectJavaScriptFiles(path, files) {
  const pathStat = await stat(path);

  if (pathStat.isFile()) {
    if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
      files.push(path);
    }
    return;
  }

  if (!pathStat.isDirectory()) {
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    await collectJavaScriptFiles(join(path, entry.name), files);
  }
}

async function invokeWebhookHandler(handler, { body, contentType }) {
  const req = Readable.from([body]);
  req.method = "POST";
  req.headers = {
    "content-type": contentType,
    "content-length": String(Buffer.byteLength(body)),
  };

  const response = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = String(value);
    },
  };

  const handled = await handler(req, response);
  assert.equal(handled, true);
  return response;
}

function createKchatRuntimeStub({ inboundRuns, routeCalls = [], contextCalls = [], realContext = false }) {
  return {
    channel: {
      inbound: {
        async run(params) {
          inboundRuns.push(params);
        },
        buildContext(params) {
          contextCalls.push(params);
          return realContext ? buildChannelInboundEventContext(params) : params;
        },
      },
      routing: {
        resolveAgentRoute(params) {
          routeCalls.push(params);
          return {
            agentId: "agent-123",
            accountId: params.accountId,
            sessionKey: `session-${params.peer.id}`,
            mainSessionKey: "main-session-123",
          };
        },
      },
      session: {
        resolveStorePath(_storeConfig, { agentId }) {
          return `/tmp/openclaw-test/${agentId}`;
        },
        async recordInboundSession() {},
      },
      reply: {
        async dispatchReplyWithBufferedBlockDispatcher() {},
      },
    },
  };
}

class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = String(url);
    this.sent = [];
    this.closed = false;
    this.listeners = new Map();
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.emit("open", {}));
  }

  send(value) {
    this.sent.push(String(value));
  }

  close() {
    this.closed = true;
    this.emit("close", {});
  }

  addEventListener(eventName, handler) {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(handler);
    this.listeners.set(eventName, listeners);
  }

  removeEventListener(eventName, handler) {
    const listeners = this.listeners.get(eventName) ?? [];
    this.listeners.set(
      eventName,
      listeners.filter((listener) => listener !== handler),
    );
  }

  emitMessage(data) {
    this.emit("message", { data });
  }

  emit(eventName, event) {
    for (const listener of this.listeners.get(eventName) ?? []) {
      listener(event);
    }
  }
}

async function waitImmediate() {
  await new Promise((resolve) => setImmediate(resolve));
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}
