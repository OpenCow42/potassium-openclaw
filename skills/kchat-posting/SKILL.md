---
name: kchat-posting
description: Post messages to Infomaniak kChat through Potassium's native OpenClaw tools backed by the liquid-potassium Node SDK. Use when an agent needs to find kChat teams or channels, create kChat posts, reply in threads with root ids, or post after resolving a channel while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/potassium-openclaw
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.potassium.enabled"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN"}}
---

# kChat Posting

Use this skill to post to kChat through `infomaniak_workflow_run`.

## Safety

- Do not invoke external binaries or shell commands for kChat API work.
- Never ask the user to paste an Infomaniak bearer token.
- Rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName` for API auth.
- Rely on `INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN` or `channels.kchat.outgoingWebhookTokenEnvName` only when webhook receive mode is enabled.
- Do not print token values in summaries, tool input echoes, error messages, or scratch files.
- Treat `createPost` and any create/update/delete kChat action as mutations.
- Post only when the user explicitly requested it.
- Preserve requested message text exactly, including capitalization and emoji.
- Configure ignored inbound senders for the posting account to avoid loops.

## Channel Capability

Potassium declares a dedicated OpenClaw channel named `kchat`. Prefer the channel runtime for normal assistant replies or durable outbound delivery when it is available. Use `infomaniak_workflow_run` directly when the user needs an explicit workflow action, manual channel lookup, or a one-off post outside channel routing.

Useful `channels.kchat` config:

- `teamName`: default team name for resolving channel names.
- `apiBaseUrl`: optional team-specific API base URL. When omitted, the channel derives `https://<teamName>.kchat.infomaniak.com` from a DNS-safe `teamName`.
- `defaultChannel`: default destination for outbound posts.
- `setOnline`: optional outbound `set_online` value.
- `receiveMode`: inbound receive mode. Use `websocket` for hosted kChat back-and-forth without a public callback URL, `webhook` for kChat outgoing webhooks, `both` during migrations, or `disabled` for outbound-only use.
- `websocketProtocol`: use `infomaniak-echo` for hosted Infomaniak kChat. Use `mattermost` only for a plain Mattermost server.
- `websocketChannelIds`: optional channel ids accepted from the WebSocket stream. Use this to restrict which kChat channels can trigger OpenClaw.
- `websocketUrl`, `websocketHost`, `websocketAppKey`, `websocketAuthEndpoint`, `websocketSubscriptions`, `websocketTeamId`, and `websocketTeamUserId`: advanced WebSocket overrides. Prefer defaults unless the deployment needs explicit values.
- `webhookPath`: inbound outgoing webhook path, default `/channels/kchat/webhook`.
- `outgoingWebhookTokenEnvName`: webhook verification token env var, default `INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN`.
- `ignoredUserIds` and `ignoredUserNames`: inbound senders to drop, usually the posting account.

Outbound destinations may be `id:<channel_id>`, `#channel`, `channel`, or `team/channel`. Replies in threads should preserve the thread or root post id as the kChat `root_id`.

For hosted Infomaniak kChat inbound setup, prefer WebSocket mode when the OpenClaw process can keep a long-lived connection:

```js
channels: {
  kchat: {
    enabled: true,
    teamName: "example-team",
    receiveMode: "websocket",
    websocketProtocol: "infomaniak-echo",
    defaultChannel: "id:<channel-id>",
    websocketChannelIds: ["<channel-id>"],
    ignoredUserIds: ["<posting-user-id>"]
  }
}
```

In WebSocket mode, OpenClaw does not need a public webhook server for inbound kChat messages. Keep `INFOMANIAK_TOKEN` available to the OpenClaw process; Potassium connects to Infomaniak's Echo/Pusher-compatible socket, resolves the team and current-user ids from `teamName`, authenticates the private and presence subscriptions, and dispatches `posted` events into the `kchat` channel runtime.

Use webhook mode only when the deployment needs kChat outgoing webhooks instead of a long-lived WebSocket. In webhook mode, configure a kChat outgoing webhook in Infomaniak/kChat to call the OpenClaw gateway URL plus `webhookPath`, put the verification token in the configured environment variable, and ignore the posting account. kChat/Mattermost payloads can be JSON or form-urlencoded, including form `payload` JSON.

When the `kchat` channel runtime is configured and active, ordinary assistant replies in that channel should flow through the channel route. Use direct `infomaniak_workflow_run` posting only for explicit one-off posts, manual troubleshooting, or setup tasks outside the OpenClaw channel conversation.


## Workflow

1. Resolve the kChat team.
   - If the user supplied a team name or slug, use it.
   - If no team is known, ask for the team name; do not guess from a channel name.
   - Run domain `kchat`, action `getTeamByName` when you need the team id.

2. Resolve the target channel id.
   - Prefer domain `kchat`, action `getChannelByNameForTeamName`.
   - For a user request like "general", first try channel name `general`.
   - Consider Mattermost-style default channels such as `town-square` only when their display name clearly matches the user's intent.
   - Use the returned `id` as `channel_id` for posting.

3. Create the root post.
   - Run domain `kchat`, action `createPost`.
   - Input should include `channel_id`, exact `message`, optional `root_id`, and optional `set_online`.
   - Set `confirm_mutating=true`.

4. Reply in a thread by creating another post in the same channel with `root_id` set to the root post id.

5. Summarize only useful result ids: team, channel, root post id, and reply post id.
