import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchKchatWebSocketEvent } from "../index.js";

// In responseMode "mentions", a thread reply (root_id set) in an open or private channel
// must mention the bot. DMs and group DMs stay fully dispatched, including threaded replies.
const channelConfig = {
  teamName: "fixture-team",
  receiveMode: "websocket",
  responseMode: "mentions",
  websocketChannelScope: "all",
  mentionAliases: [],
};
const botUserId = "bot-user-id";
const senderUserId = "sender-user-id";

function createPostedFrame({ channelId, channelType, text, rootId, userId = senderUserId }) {
  const post = {
    id: `p-${Math.random()}`,
    channel_id: channelId,
    user_id: userId,
    message: text,
    create_at: Date.now(),
    ...(rootId ? { root_id: rootId } : {}),
  };
  return {
    event: "posted",
    data: JSON.stringify({
      post: JSON.stringify(post),
      sender_name: "sender",
      ...(channelType ? { channel_type: channelType } : {}),
    }),
  };
}

function createGateHarness(channelTypes = {}, { failIdentity = false } = {}) {
  const calls = { getchannel: 0, getuser: 0, dispatched: 0, warns: [] };
  const client = {
    kchat: {
      operations: {
        getuser: async () => {
          calls.getuser += 1;
          if (failIdentity) {
            throw new Error("HTTP 500");
          }

          return { data: { id: botUserId, username: "kai.b.", name: "Kai B." } };
        },
        getchannel: async ({ path }) => {
          calls.getchannel += 1;
          return { data: { id: path.channel_id, type: channelTypes[path.channel_id] } };
        },
      },
    },
  };
  const runtime = {
    channel: {
      inbound: {
        run: async () => {
          calls.dispatched += 1;
        },
      },
    },
  };
  const log = { warn: (message) => calls.warns.push(message), debug() {}, info() {}, error() {} };
  const responseGateState = {};
  const send = (frame) =>
    dispatchKchatWebSocketEvent({
      cfg: {},
      channelConfig,
      runtime,
      frame,
      dedupeState: new Map(),
      client,
      token: "fixture",
      log,
      responseGateState,
    });
  return { calls, send };
}

function assertDropped(result, reason, harness) {
  assert.equal(result?.dispatched, false, JSON.stringify(result));
  assert.equal(result?.reason, reason);
  assert.equal(harness.calls.dispatched, 0);
}

function assertDispatched(result, harness) {
  assert.notEqual(result?.dispatched, false, JSON.stringify(result));
  assert.equal(harness.calls.dispatched, 1);
}

test("open channel, top-level, no mention -> dropped not_addressed", async () => {
  const harness = createGateHarness();
  assertDropped(await harness.send(createPostedFrame({ channelId: "c1", channelType: "O", text: "random chatter" })), "not_addressed", harness);
});

test("open channel, mentioned by display name 'Kai B.' -> dispatched", async () => {
  const harness = createGateHarness();
  assertDispatched(await harness.send(createPostedFrame({ channelId: "c1", channelType: "O", text: "Kai B., status?" })), harness);
});

test("open channel, mentioned by username '@kai.b.' -> dispatched", async () => {
  const harness = createGateHarness();
  assertDispatched(await harness.send(createPostedFrame({ channelId: "c1", channelType: "O", text: "@kai.b. status?" })), harness);
});

test("open channel, thread reply, no mention -> dropped not_addressed", async () => {
  const harness = createGateHarness();
  const frame = createPostedFrame({ channelId: "c1", channelType: "O", text: "thread chatter", rootId: "root-1" });
  assertDropped(await harness.send(frame), "not_addressed", harness);
});

test("private channel, thread reply without frame type, no mention -> dropped not_addressed", async () => {
  const harness = createGateHarness({ p1: "P" });
  const frame = createPostedFrame({ channelId: "p1", text: "thread chatter", rootId: "root-1" });
  assertDropped(await harness.send(frame), "not_addressed", harness);
  assert.equal(harness.calls.getchannel, 1);
});

test("open channel, thread reply with mention -> dispatched", async () => {
  const harness = createGateHarness();
  const frame = createPostedFrame({ channelId: "c1", channelType: "O", text: "@kai.b. can you check this?", rootId: "root-1" });
  assertDispatched(await harness.send(frame), harness);
});

test("DM, top-level, no mention -> dispatched", async () => {
  const harness = createGateHarness();
  assertDispatched(await harness.send(createPostedFrame({ channelId: "dm1", channelType: "D", text: "ping" })), harness);
});

test("DM, thread reply, no mention -> dispatched", async () => {
  const harness = createGateHarness();
  const frame = createPostedFrame({ channelId: "dm1", channelType: "D", text: "follow-up", rootId: "root-dm" });
  assertDispatched(await harness.send(frame), harness);
});

test("DM, thread reply without frame type, no mention -> dispatched via getchannel lookup", async () => {
  const harness = createGateHarness({ dm1: "D" });
  const frame = createPostedFrame({ channelId: "dm1", text: "follow-up", rootId: "root-dm" });
  assertDispatched(await harness.send(frame), harness);
  assert.equal(harness.calls.getchannel, 1);
});

test("group DM, no mention -> dispatched", async () => {
  const harness = createGateHarness();
  assertDispatched(await harness.send(createPostedFrame({ channelId: "g1", channelType: "G", text: "anyone?" })), harness);
});

test("group DM, thread reply without frame type, no mention -> dispatched", async () => {
  const harness = createGateHarness({ g1: "G" });
  assertDispatched(await harness.send(createPostedFrame({ channelId: "g1", text: "anyone?", rootId: "root-g" })), harness);
});

test("open channel, self-message -> dropped self_message", async () => {
  const harness = createGateHarness();
  const frame = createPostedFrame({ channelId: "c1", channelType: "O", text: "@kai.b. my own reply", rootId: "root-1", userId: botUserId });
  assertDropped(await harness.send(frame), "self_message", harness);
});

test("identity fetch fails, not addressed -> dropped not_addressed (fail closed)", async () => {
  const harness = createGateHarness({}, { failIdentity: true });
  const frame = createPostedFrame({ channelId: "c1", channelType: "O", text: "thread chatter", rootId: "root-1" });
  assertDropped(await harness.send(frame), "not_addressed", harness);
  assert.equal(harness.calls.getuser, 1);
});
