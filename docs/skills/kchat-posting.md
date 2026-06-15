# kChat Posting

The `kchat-posting` skill documents safe Infomaniak kChat posting workflows
through Potassium's native OpenClaw tools and the dedicated `kchat` channel.
It covers outbound posts, threaded replies, media uploads, inbound message
routing, and typing or presence behavior.

The executable skill instructions live in
[`skills/kchat-posting/SKILL.md`](../../skills/kchat-posting/SKILL.md).
Detailed channel setup lives in the [kChat Channel guide](../kchat-channel.md).

## Capabilities

- Send outbound text posts to kChat channels.
- Send media posts when the runtime receives local media assets.
- Resolve destinations by channel ID, `#channel`, bare channel name, or
  `team/channel`.
- Reply in the kChat thread selected by an inbound message.
- Receive inbound events through webhook or WebSocket channel modes.
- Publish native typing indicators and optional online presence during replies.

## Safety Model

kChat posts can disclose user or business information. Agents using this skill
should:

- rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`;
- never ask the user to paste an Infomaniak bearer token;
- use explicit channel IDs or clearly named destinations when possible;
- avoid sending to a default channel when an inbound event provides a channel;
- treat outbound posts, media uploads, and replies as user-visible actions;
- avoid shell commands or external binaries for kChat API work.

Inbound replies must use the channel and thread context from the received kChat
event. Events without enough reply context should fail closed instead of falling
back to a configured default channel.

## Workflow

1. Resolve the destination.

   Prefer `id:<channel_id>` when the user provides a channel ID. Use `#channel`,
   `channel`, or `team/channel` only when the configured kChat team is clear.

2. Choose the transport.

   Use the native `kchat` channel for conversational posts and replies. Use
   Potassium workflow tools only when the task requires a reviewed Infomaniak
   API workflow outside the channel surface.

3. Preserve thread context.

   For inbound events, reply under the original root post or existing thread
   root. Do not rewrite mentions or strip the original message text before
   dispatch.

4. Summarize the result.

   Report the destination, thread context when available, created post ID when
   returned, and any media upload result relevant to the user.

## Configuration Pointers

- `receiveMode`: `webhook`, `websocket`, `both`, or `disabled`.
- `responseMode`: `mentions` by default, or `all` for deliberate global listen.
- `defaultChannel`: default outbound destination for new posts, never a fallback
  for inbound replies missing channel context.
- `typingIndicator`: enables native typing events during inbound replies.
- `websocketChannelScope`: `selected` by default; use `all` only deliberately.

See the [kChat Channel guide](../kchat-channel.md) for full setup examples and
field-level configuration details.

## Troubleshooting

- If a channel name is ambiguous, ask for a channel ID.
- If an inbound event has no `channel_id`, report the missing reply context.
- If the plugin ignores a message in `mentions` mode, verify mentions,
  `mentionAliases`, thread context, and ignored sender filters.
- If WebSocket receive accepts too many channels, switch back to selected
  channel scope and configure `websocketChannelIds`.

## Related Docs

- [Potassium Skill](potassium.md)
- [kChat Channel](../kchat-channel.md)
- [Architecture](../architecture.md)
- [Liquid Potassium Integration](../liquid-potassium-integration.md)
