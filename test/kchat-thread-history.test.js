import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const pluginModuleUrl = pathToFileURL(join(repositoryRoot, "index.js")).href;

const ROOT_ID = "01a17a0c-ae9b-7268-ba96-007affad6596";
const CHANNEL_ID = "01a1748d-def7-7129-80f4-966651f71188";

function createThreadResponse(extraPosts = []) {
  const posts = [
    {
      id: ROOT_ID,
      channel_id: CHANNEL_ID,
      user_id: "user-asker",
      message: "Is PHP 8.3 affected by the new CVE?\nWe run 8.3.4 on prod.",
      create_at: Date.UTC(2026, 9, 26, 9, 0, 0),
      root_id: "",
    },
    {
      id: "reply-1",
      channel_id: CHANNEL_ID,
      user_id: "user-helper",
      message: "Checking the advisory now.",
      create_at: Date.UTC(2026, 9, 26, 9, 5, 0),
      root_id: ROOT_ID,
    },
    {
      id: "mention-post",
      channel_id: CHANNEL_ID,
      user_id: "user-ruben",
      message: "@kai can you answer this?",
      create_at: Date.UTC(2026, 9, 26, 9, 10, 0),
      root_id: ROOT_ID,
    },
    ...extraPosts,
  ];
  return {
    order: posts.map((post) => post.id).reverse(),
    posts: Object.fromEntries(posts.map((post) => [post.id, post])),
  };
}

function createThreadClient({ thread = createThreadResponse(), threadError, usersError, calls = [] } = {}) {
  return {
    kchat: {
      async getpostthread(request) {
        assert.ok(request.signal instanceof AbortSignal);
        calls.push(["getpostthread", { path: request.path }]);
        if (threadError) {
          throw threadError;
        }
        return thread;
      },
      async getusersbyids(request) {
        calls.push(["getusersbyids", { body: request.body }]);
        if (usersError) {
          throw usersError;
        }
        return [
          { id: "user-asker", username: "alice" },
          { id: "user-helper", username: "bob" },
          { id: "user-ruben", username: "ruben" },
        ];
      },
    },
  };
}

function createRuntimeStub(inboundRuns) {
  return {
    channel: {
      inbound: {
        async run(params) {
          inboundRuns.push(params);
        },
        buildContext(params) {
          return params;
        },
      },
      routing: {
        resolveAgentRoute(params) {
          return {
            agentId: "agent-123",
            accountId: params.accountId,
            sessionKey: `session-${params.peer.id}`,
            mainSessionKey: "main-session-123",
          };
        },
      },
      session: {
        resolveStorePath() {
          return "/tmp/openclaw-test/agent-123";
        },
        async recordInboundSession() {},
      },
      reply: {
        async dispatchReplyWithBufferedBlockDispatcher() {},
      },
    },
  };
}

function createLog() {
  const warnings = [];
  return {
    warnings,
    log: {
      warn(message) {
        warnings.push(message);
      },
      error() {},
      info() {},
      debug() {},
    },
  };
}

async function dispatchMention(pluginModule, { client, channelConfig = {}, threadHistoryState, log, postId = "mention-post", rootId = ROOT_ID, text = "@kai can you answer this?" }) {
  const inboundRuns = [];
  const inbound = pluginModule.normalizeKchatOutgoingWebhookPayload({
    channel_id: CHANNEL_ID,
    team_domain: "oomnium-ag",
    post_id: postId,
    ...(rootId ? { root_id: rootId } : {}),
    user_id: "user-ruben",
    user_name: "ruben",
    text,
  });
  const result = await pluginModule.dispatchKchatInboundWebhookEvent({
    cfg: { channels: { kchat: { responseMode: "all", ...channelConfig } } },
    channelConfig: { responseMode: "all", ...channelConfig },
    runtime: createRuntimeStub(inboundRuns),
    inbound,
    client,
    log,
    threadHistoryState,
  });
  return { result, inboundRuns, input: inboundRuns[0]?.adapter.ingest() };
}

test("kChat thread replies prepend fetched thread history to the agent text only", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const calls = [];
  const threadHistoryState = pluginModule.createKchatThreadHistoryState();
  const { result, inboundRuns, input } = await dispatchMention(pluginModule, {
    client: createThreadClient({ calls }),
    threadHistoryState,
  });

  assert.equal(result.dispatched, true);
  assert.deepEqual(calls[0], ["getpostthread", { path: { post_id: ROOT_ID } }]);
  assert.equal(calls[1][0], "getusersbyids");
  assert.deepEqual([...calls[1][1].body].sort(), ["user-asker", "user-helper", "user-ruben"]);

  assert.equal(input.rawText, "@kai can you answer this?");
  assert.equal(input.textForCommands, "@kai can you answer this?");
  assert.equal(
    input.textForAgent,
    [
      "[kChat thread context: 2 earlier messages from this thread, oldest first]",
      "- 2026-10-26T09:00:00.000Z @alice (thread root): Is PHP 8.3 affected by the new CVE?",
      "  We run 8.3.4 on prod.",
      "- 2026-10-26T09:05:00.000Z @bob: Checking the advisory now.",
      "[End of kChat thread context. The new message follows.]",
      "",
      "@kai can you answer this?",
    ].join("\n"),
  );

  const turn = await inboundRuns[0].adapter.resolveTurn(input);
  assert.equal(turn.ctxPayload.message.bodyForAgent, input.textForAgent);
  assert.equal(turn.ctxPayload.message.rawBody, "@kai can you answer this?");
  assert.equal(turn.ctxPayload.conversation.threadId, ROOT_ID);
});

test("kChat thread history is fetched only once per thread root", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const calls = [];
  const client = createThreadClient({ calls });
  const threadHistoryState = pluginModule.createKchatThreadHistoryState();

  const first = await dispatchMention(pluginModule, { client, threadHistoryState });
  const second = await dispatchMention(pluginModule, {
    client,
    threadHistoryState,
    postId: "follow-up-post",
    text: "@kai and for 8.2?",
  });

  assert.match(first.input.textForAgent, /kChat thread context/);
  assert.equal(second.input.textForAgent, "@kai and for 8.2?");
  assert.equal(calls.filter(([name]) => name === "getpostthread").length, 1);
});

test("kChat thread history skips root posts, non-thread posts, and disabled config", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const calls = [];
  const client = createThreadClient({ calls });

  const rootPost = await dispatchMention(pluginModule, {
    client,
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
    postId: ROOT_ID,
    rootId: ROOT_ID,
    text: "new root",
  });
  const plainPost = await dispatchMention(pluginModule, {
    client,
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
    postId: "plain-post",
    rootId: null,
    text: "plain post",
  });
  const disabled = await dispatchMention(pluginModule, {
    client,
    channelConfig: { threadHistory: false },
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
  });

  assert.equal(rootPost.input.textForAgent, "new root");
  assert.equal(plainPost.input.textForAgent, "plain post");
  assert.equal(disabled.input.textForAgent, "@kai can you answer this?");
  assert.deepEqual(calls, []);
});

test("kChat thread history fetch failures degrade to the single post and retry later", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const threadHistoryState = pluginModule.createKchatThreadHistoryState();
  const { warnings, log } = createLog();
  const forbidden = Object.assign(new Error("403 Forbidden for Bearer secret-token-value"), { status: 403 });
  const calls = [];

  const failed = await dispatchMention(pluginModule, {
    client: createThreadClient({ threadError: forbidden, calls }),
    threadHistoryState,
    log,
  });

  assert.equal(failed.result.dispatched, true);
  assert.equal(failed.inboundRuns.length, 1);
  assert.equal(failed.input.textForAgent, "@kai can you answer this?");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /kChat thread history unavailable/);
  assert.match(warnings[0], /403 Forbidden/);
  assert.doesNotMatch(warnings[0], /secret-token-value/);

  const retried = await dispatchMention(pluginModule, {
    client: createThreadClient({ calls }),
    threadHistoryState,
    postId: "follow-up-post",
    text: "@kai ping",
  });
  assert.match(retried.input.textForAgent, /kChat thread context/);
  assert.equal(calls.filter(([name]) => name === "getpostthread").length, 2);
});

test("kChat thread history degrades for missing operations, malformed responses, and missing credentials", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const { warnings, log } = createLog();

  const missingOperation = await dispatchMention(pluginModule, {
    client: { kchat: {} },
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
    log,
  });
  const malformed = await dispatchMention(pluginModule, {
    client: createThreadClient({ thread: { order: [] } }),
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
    log,
  });
  const noCredentials = await dispatchMention(pluginModule, {
    client: undefined,
    channelConfig: { tokenEnvName: "KCHAT_THREAD_HISTORY_TEST_UNSET_TOKEN", teamName: "oomnium-ag" },
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
    log,
  });

  for (const outcome of [missingOperation, malformed, noCredentials]) {
    assert.equal(outcome.result.dispatched, true);
    assert.equal(outcome.input.textForAgent, "@kai can you answer this?");
  }
  assert.equal(warnings.length, 3);
});

test("kChat thread history falls back to user ids when author lookup fails", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const { warnings, log } = createLog();
  const { input } = await dispatchMention(pluginModule, {
    client: createThreadClient({ usersError: new Error("users lookup down") }),
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
    log,
  });

  assert.match(input.textForAgent, /@user-asker \(thread root\): Is PHP 8\.3 affected/);
  assert.match(warnings[0], /author lookup failed/);
});

test("kChat thread history context keeps the root, recent replies, and truncates long posts", async () => {
  const { formatKchatThreadHistoryContext } = await import(pluginModuleUrl);
  const posts = [
    { id: "root", userId: "u0", text: "root question", createAt: 1000, fileCount: 0 },
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `reply-${index}`,
      userId: "u1",
      text: index === 4 ? "x".repeat(50) : `reply ${index}`,
      createAt: 2000 + index,
      fileCount: index === 3 ? 2 : 0,
    })),
  ];

  const context = formatKchatThreadHistoryContext(posts, {
    rootId: "root",
    postLimit: 3,
    maxTextChars: 10,
    userNames: new Map([["u0", "alice"]]),
  });

  assert.equal(
    context,
    [
      "[kChat thread context: 3 earlier messages from this thread, oldest first; 3 older replies omitted]",
      "- 1970-01-01T00:00:01.000Z @alice (thread root): root quest… [truncated]",
      "- 1970-01-01T00:00:02.003Z @u1: reply 3 [2 attachments]",
      "- 1970-01-01T00:00:02.004Z @u1: xxxxxxxxxx… [truncated]",
      "[End of kChat thread context. The new message follows.]",
    ].join("\n"),
  );
  assert.equal(formatKchatThreadHistoryContext([], { rootId: "root" }), undefined);
});

test("kChat thread history ignores deleted posts and honors the post limit from channel config", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const thread = createThreadResponse([
    {
      id: "deleted-reply",
      user_id: "user-helper",
      message: "deleted text",
      create_at: Date.UTC(2026, 9, 26, 9, 6, 0),
      delete_at: Date.UTC(2026, 9, 26, 9, 7, 0),
      root_id: ROOT_ID,
    },
  ]);
  const { input } = await dispatchMention(pluginModule, {
    client: createThreadClient({ thread }),
    channelConfig: { threadHistoryPostLimit: 1, threadHistoryMaxTextChars: 2000 },
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
  });

  assert.doesNotMatch(input.textForAgent, /deleted text/);
  assert.doesNotMatch(input.textForAgent, /Checking the advisory/);
  assert.match(input.textForAgent, /1 earlier message from this thread, oldest first; 1 older reply omitted/);
  assert.match(input.textForAgent, /@alice \(thread root\)/);
});

test("kChat thread history state is bounded", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const calls = [];
  const client = createThreadClient({ calls });
  const threadHistoryState = pluginModule.createKchatThreadHistoryState({ maxEntries: 2 });

  for (const rootId of ["root-a", "root-b", "root-c", "root-a"]) {
    await dispatchMention(pluginModule, { client, threadHistoryState, rootId, postId: `post-in-${rootId}` });
  }

  assert.equal(threadHistoryState.ingestedRoots.size, 2);
  assert.deepEqual(
    calls.filter(([name]) => name === "getpostthread").map(([, request]) => request.path.post_id),
    ["root-a", "root-b", "root-c", "root-a"],
  );
});

test("kChat WebSocket thread replies receive thread history context", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const inboundRuns = [];
  const calls = [];
  const result = await pluginModule.dispatchKchatWebSocketEvent({
    cfg: { channels: { kchat: { teamName: "oomnium-ag", websocketChannelScope: "all", responseMode: "all" } } },
    channelConfig: { teamName: "oomnium-ag", websocketChannelScope: "all", responseMode: "all" },
    runtime: createRuntimeStub(inboundRuns),
    client: createThreadClient({ calls }),
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
    frame: {
      event: "posted",
      data: {
        channel_name: "security",
        sender_name: "ruben",
        post: JSON.stringify({
          id: "mention-post",
          root_id: ROOT_ID,
          channel_id: CHANNEL_ID,
          user_id: "user-ruben",
          message: "@kai can you answer this?",
          create_at: Date.UTC(2026, 9, 26, 9, 10, 0),
        }),
      },
      broadcast: { team_id: "team-123" },
      seq: 1,
    },
  });

  assert.equal(result.dispatched, true);
  const input = inboundRuns[0].adapter.ingest();
  assert.match(input.textForAgent, /^\[kChat thread context: 2 earlier messages/);
  assert.match(input.textForAgent, /@alice \(thread root\): Is PHP 8\.3 affected by the new CVE\?/);
  assert.ok(input.textForAgent.endsWith("\n\n@kai can you answer this?"));
  assert.deepEqual(calls[0], ["getpostthread", { path: { post_id: ROOT_ID } }]);
});

test("kChat channel schema and manifest expose thread history settings", async () => {
  const { readFile } = await import("node:fs/promises");
  const pluginModule = await import(pluginModuleUrl);
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "openclaw.plugin.json"), "utf8"));
  for (const properties of [
    pluginModule.PotassiumKchatChannelConfigJsonSchema.properties,
    manifest.channelConfigs.kchat.schema.properties,
  ]) {
    assert.equal(properties.threadHistory.default, true);
    assert.equal(properties.threadHistoryPostLimit.default, 20);
    assert.equal(properties.threadHistoryMaxTextChars.default, 1000);
  }
});

test("kChat thread history uses the team-scoped SDK client endpoints", async () => {
  const pluginModule = await import(pluginModuleUrl);
  const requests = [];
  const fetchStub = async (url, init) => {
    requests.push({ url: String(url), method: init.method, body: init.body });
    const payload = String(url).endsWith("/thread")
      ? createThreadResponse()
      : [{ id: "user-asker", username: "alice" }];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
  const inboundRuns = [];
  const inbound = pluginModule.normalizeKchatOutgoingWebhookPayload({
    channel_id: CHANNEL_ID,
    post_id: "mention-post",
    root_id: ROOT_ID,
    user_id: "user-ruben",
    text: "@kai can you answer this?",
  });
  await pluginModule.dispatchKchatInboundWebhookEvent({
    cfg: { channels: { kchat: { teamName: "oomnium-ag", responseMode: "all", typingIndicator: false } } },
    channelConfig: { teamName: "oomnium-ag", responseMode: "all", typingIndicator: false },
    runtime: createRuntimeStub(inboundRuns),
    inbound,
    fetch: fetchStub,
    token: "fixture",
    threadHistoryState: pluginModule.createKchatThreadHistoryState(),
  });

  assert.equal(requests[0].method, "GET");
  assert.equal(requests[0].url, `https://oomnium-ag.kchat.infomaniak.com/api/v4/posts/${ROOT_ID}/thread`);
  assert.equal(requests[1].method, "POST");
  assert.equal(requests[1].url, "https://oomnium-ag.kchat.infomaniak.com/api/v4/users/ids");
  assert.match(inboundRuns[0].adapter.ingest().textForAgent, /@alice \(thread root\)/);
});
