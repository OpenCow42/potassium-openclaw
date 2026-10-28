import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchKchatWebSocketEvent,
  isKchatDirectOrGroupDm,
  normalizeKchatWebSocketPostEvent,
} from "../index.js";

// kChat "posted" WebSocket frames carry channel_type on the event data, not on the post.
// These cases cover the mention gate resolving DMs from the frame or a getchannel lookup.
const channelConfig = {
  teamName: "fixture-team",
  receiveMode: "websocket",
  responseMode: "mentions",
  websocketChannelScope: "all",
  mentionAliases: ["Kai Voss", "Kai"],
};
const botUserId = "bot-user-id";
const senderUserId = "sender-user-id";

function createPostedFrame({ channelId, channelType, text, withType = true }) {
  const post = {
    id: `p-${Math.random()}`,
    channel_id: channelId,
    user_id: senderUserId,
    message: text,
    create_at: Date.now(),
  };
  return {
    event: "posted",
    data: JSON.stringify({
      post: JSON.stringify(post),
      sender_name: "sender",
      ...(withType ? { channel_type: channelType } : {}),
    }),
  };
}

function createGateHarness(channelTypes, { failLookup = false } = {}) {
  const calls = { getchannel: 0, dispatched: 0, warns: [] };
  const client = {
    kchat: {
      operations: {
        getuser: async () => ({ data: { id: botUserId, username: "kai", name: "Kai Voss" } }),
        getchannel: async ({ path }) => {
          calls.getchannel += 1;
          if (failLookup) {
            throw new Error("HTTP 403");
          }

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

test("normalizer: DM frame -> channel_type D", () => {
  const payload = normalizeKchatWebSocketPostEvent(
    createPostedFrame({ channelId: "dm1", channelType: "D", text: "can you hear this?" }),
    channelConfig,
  );
  assert.equal(payload.channel_type, "D");
});

test("normalizer: open channel frame -> channel_type O (not DM)", () => {
  const payload = normalizeKchatWebSocketPostEvent(
    createPostedFrame({ channelId: "c1", channelType: "O", text: "hello all" }),
    channelConfig,
  );
  assert.equal(payload.channel_type, "O");
  assert.equal(isKchatDirectOrGroupDm({ channelType: payload.channel_type }), false);
});

test("gate: DM with no frame type, no mention -> dispatched via getchannel lookup", async () => {
  const harness = createGateHarness({ dm1: "D" });
  const result = await harness.send(createPostedFrame({ channelId: "dm1", text: "can you hear this?", withType: false }));
  assert.notEqual(result?.dispatched, false, JSON.stringify(result));
  assert.equal(harness.calls.dispatched, 1);
  assert.equal(harness.calls.getchannel, 1);
  await harness.send(createPostedFrame({ channelId: "dm1", text: "second message", withType: false }));
  assert.equal(harness.calls.getchannel, 1, "lookup should be cached");
  assert.equal(harness.calls.dispatched, 2);
});

test("gate: DM with frame type D -> dispatched, zero lookups", async () => {
  const harness = createGateHarness({});
  const result = await harness.send(createPostedFrame({ channelId: "dm2", channelType: "D", text: "ping" }));
  assert.notEqual(result?.dispatched, false, JSON.stringify(result));
  assert.equal(harness.calls.getchannel, 0);
});

test("gate: group DM (G) no mention -> dispatched", async () => {
  const harness = createGateHarness({ g1: "G" });
  const result = await harness.send(createPostedFrame({ channelId: "g1", text: "anyone?", withType: false }));
  assert.notEqual(result?.dispatched, false, JSON.stringify(result));
});

test("gate: open channel no mention -> dropped not_addressed", async () => {
  const harness = createGateHarness({ c1: "O" });
  const result = await harness.send(createPostedFrame({ channelId: "c1", text: "random chatter", withType: false }));
  assert.equal(result?.dispatched, false);
  assert.equal(result?.reason, "not_addressed");
  assert.equal(harness.calls.dispatched, 0);
});

test("gate: private channel no mention -> dropped", async () => {
  const harness = createGateHarness({ p1: "P" });
  const result = await harness.send(createPostedFrame({ channelId: "p1", text: "random chatter", withType: false }));
  assert.equal(result?.reason, "not_addressed");
});

test("gate: open channel with 'Kai' alias -> dispatched, no lookup", async () => {
  const harness = createGateHarness({ c1: "O" });
  const result = await harness.send(createPostedFrame({ channelId: "c1", text: "Kai, status?", withType: false }));
  assert.notEqual(result?.dispatched, false);
  assert.equal(harness.calls.getchannel, 0);
});

test("gate: lookup failure -> warn + falls back to mention gate (dropped)", async () => {
  const harness = createGateHarness({}, { failLookup: true });
  const result = await harness.send(createPostedFrame({ channelId: "dm9", text: "can you hear this?", withType: false }));
  assert.equal(result?.reason, "not_addressed");
  assert.equal(harness.calls.warns.length, 1);
  assert.match(harness.calls.warns[0], /channel type lookup failed/);
  await harness.send(createPostedFrame({ channelId: "dm9", text: "again", withType: false }));
  assert.equal(harness.calls.getchannel, 2, "failed lookups must not be cached");
});

test("gate: self-message in DM still dropped", async () => {
  const harness = createGateHarness({ dm1: "D" });
  const frame = createPostedFrame({ channelId: "dm1", channelType: "D", text: "my own reply" });
  const data = JSON.parse(frame.data);
  const post = JSON.parse(data.post);
  post.user_id = botUserId;
  data.post = JSON.stringify(post);
  frame.data = JSON.stringify(data);
  const result = await harness.send(frame);
  assert.equal(result?.reason, "self_message");
});
