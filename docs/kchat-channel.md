# kChat Channel

Potassium adds a dedicated OpenClaw channel capability named `kchat` for
Infomaniak kChat. The channel lets OpenClaw post into kChat, receive incoming
kChat events, and send replies back to the original channel or thread.

This document covers channel-specific setup. General plugin install and
credential setup live in the [README](../README.md).

## Capabilities

- Send outbound text posts to kChat channels.
- Resolve destinations by channel ID, channel name, or `team/channel`.
- Receive inbound kChat events through outgoing webhooks or WebSockets.
- Route replies from inbound events without falling back to a default channel.
- Preserve kChat thread context for root posts and thread replies.
- Publish native kChat typing indicators while OpenClaw prepares replies.
- Optionally set the authenticated kChat user online at reply start.
- Bound WebSocket duplicate suppression and dispatch concurrency.

## Recommended Receive Mode

Use `receiveMode: "websocket"` for most OpenClaw installs. It does not require a
public callback URL and works with hosted Infomaniak kChat through the
Echo/Pusher-compatible socket.

Use `receiveMode: "webhook"` when you already have a public OpenClaw gateway URL
and prefer kChat outgoing webhooks.

Use `receiveMode: "both"` during migrations or debugging, and `disabled` when
the channel should only send outbound messages.

## Minimal WebSocket Config

```json5
{
  plugins: {
    entries: {
      potassium: {
        enabled: true,
        config: {
          tokenEnvName: "INFOMANIAK_TOKEN",
          channels: {
            kchat: {
              enabled: true,
              teamName: "example-team",
              defaultChannel: "id:<channel-id>",
              receiveMode: "websocket",
              websocketProtocol: "infomaniak-echo",
              websocketChannelScope: "selected",
              websocketChannelIds: ["<channel-id>"],
              typingIndicator: true,
              setOnlineOnReplyStart: true
            }
          }
        }
      }
    }
  }
}
```

`INFOMANIAK_TOKEN` must be present in the OpenClaw process environment. The
adapter uses it for outbound posts, WebSocket authentication, typing indicators,
and optional status updates.

## Channel Config

- `enabled`: whether the kChat channel account is enabled.
- `tokenEnvName`: environment variable name for the Infomaniak bearer token.
  Defaults to `INFOMANIAK_TOKEN`.
- `teamName`: default kChat team name. Used for channel-name resolution and for
  deriving `https://<teamName>.kchat.infomaniak.com` when `apiBaseUrl` is not
  set.
- `apiBaseUrl`: optional team-specific kChat API base URL.
- `defaultChannel`: default outbound destination for OpenClaw-initiated posts.
  Inbound replies do not use this as a fallback.
- `setOnline`: optional `set_online` value sent with outbound post creation.
- `typingIndicator`: publishes native kChat typing indicators for inbound
  replies. Defaults to `true`.
- `setOnlineOnReplyStart`: manually sets the authenticated kChat user online
  once when an inbound reply starts. When omitted, it is enabled only when
  `setOnline` is `true`.
- `receiveMode`: `webhook`, `websocket`, `both`, or `disabled`. Defaults to
  `webhook`.
- `websocketProtocol`: `infomaniak-echo` for hosted kChat, or `mattermost` for a
  plain Mattermost `/api/v4/websocket` server. Defaults to `infomaniak-echo`.
- `webhookPath`: OpenClaw gateway path for kChat outgoing webhooks. Defaults to
  `/channels/kchat/webhook`.
- `outgoingWebhookTokenEnvName`: environment variable for the webhook
  verification token. Defaults to `INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN`.
- `ignoredUserIds`: kChat sender user IDs to ignore.
- `ignoredUserNames`: kChat sender usernames to ignore.
- `websocketUrl`: optional explicit WebSocket URL.
- `websocketHost`: Infomaniak Echo socket host. Defaults to
  `websocket.kchat.infomaniak.com`.
- `websocketAppKey`: Infomaniak Echo/Pusher app key. Defaults to `kchat-key`.
- `websocketAuthEndpoint`: optional Echo private-channel auth endpoint. Defaults
  to `<apiBaseUrl>/broadcasting/auth`.
- `websocketSubscriptions`: optional explicit Echo subscription channel names.
- `websocketTeamId`: optional kChat team ID override for Echo subscriptions.
- `websocketTeamUserId`: optional kChat team user ID override for Echo
  subscriptions.
- `websocketChannelScope`: `selected` or `all`. Defaults to `selected`, which
  requires `websocketChannelIds`. The only way to accept every visible channel
  is to set `websocketChannelScope: "all"` deliberately.
- `websocketChannelIds`: channel IDs accepted when the WebSocket scope is
  `selected`.
- `websocketDedupeWindowMs`: milliseconds to suppress duplicate WebSocket posts
  by post ID. Defaults to `120000`; set `0` to disable duplicate suppression.
- `websocketDedupeMaxEntries`: maximum post IDs retained in the duplicate
  suppression cache. Defaults to `10000`.
- `websocketDispatchConcurrency`: maximum WebSocket post events dispatched into
  OpenClaw at the same time. Defaults to `1`.
- `websocketDispatchQueueSize`: maximum WebSocket post events waiting for
  dispatch before new events are dropped. Defaults to `100`.

## Outbound Destinations

Outbound posts can target:

- `id:<channel_id>` for a known kChat channel ID.
- `#support` for a channel name in the configured `teamName`.
- `support` for the same channel-name lookup without the hash.
- `example-team/support` for an explicit team/channel lookup.

Thread replies use the root post or reply ID as the kChat thread root ID.

## Inbound Reply Routing

Inbound kChat events are the routing authority for replies. When an event
includes `channel_id`, OpenClaw replies are sent back to `id:<channel_id>`, even
when `defaultChannel` is configured.

Threading rules:

- If the event includes `root_id`, replies stay in that existing thread.
- If the event is a root post with `post_id` and no `root_id`, replies are
  threaded under the original post.
- Events without `channel_id` are dropped or rejected as missing reply context.
  They are not allowed to fall back to `defaultChannel`.

## WebSocket Receive

For hosted Infomaniak kChat, set:

```json5
{
  receiveMode: "websocket",
  websocketProtocol: "infomaniak-echo"
}
```

Potassium connects to Infomaniak's Echo/Pusher-compatible socket, resolves the
team and user IDs from `teamName`, authenticates private subscriptions through
`/broadcasting/auth`, and dispatches `posted` events into OpenClaw.

Use:

```json5
{
  websocketChannelScope: "selected",
  websocketChannelIds: ["<channel-id>"]
}
```

to restrict intake to specific kChat channel IDs. This is the default safety
posture; omitting both `websocketChannelScope` and `websocketChannelIds` fails
closed instead of accepting every visible channel.

Use:

```json5
{
  websocketChannelScope: "all"
}
```

only when the install deliberately accepts posts from every visible kChat
channel. Omitting `websocketChannelIds` does not request all-channel intake;
all-channel intake requires `websocketChannelScope: "all"`.

For a plain Mattermost server, set `websocketProtocol: "mattermost"` and
optionally `websocketUrl`.

## Webhook Receive

For webhook mode, create a kChat outgoing webhook that points at the OpenClaw
gateway URL plus `webhookPath`. Store the webhook verification token in
`INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN` or the configured
`outgoingWebhookTokenEnvName`.

kChat/Mattermost outgoing webhook payloads may arrive as JSON,
form-urlencoded fields, or a form `payload` JSON value.

Add the posting account to `ignoredUserIds` or `ignoredUserNames` to avoid reply
loops.

## Typing And Presence

`typingIndicator` controls native kChat typing events for inbound replies. It is
enabled by default. For threaded replies, Potassium sends the typing event with
the inbound thread root so kChat shows the indicator in the right conversation.

`setOnlineOnReplyStart` controls manual online presence at reply start. It is
different from outbound post `setOnline`, which only affects post creation. A
manual status update can persist until kChat auto-updates it or another status
change occurs.

Typing and status failures are non-fatal. Potassium logs a token-safe warning
and still lets OpenClaw generate and send the final reply.

## Full Example

```json5
{
  plugins: {
    entries: {
      potassium: {
        enabled: true,
        config: {
          tokenEnvName: "INFOMANIAK_TOKEN",
          blockMutating: true,
          allowedDomains: ["kdrive", "mail", "kchat", "urlShortener"],
          channels: {
            kchat: {
              enabled: true,
              teamName: "example-team",
              apiBaseUrl: "https://example-team.kchat.infomaniak.com",
              defaultChannel: "id:<channel-id>",
              setOnline: false,
              typingIndicator: true,
              setOnlineOnReplyStart: true,
              receiveMode: "websocket",
              websocketProtocol: "infomaniak-echo",
              webhookPath: "/channels/kchat/webhook",
              outgoingWebhookTokenEnvName: "INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN",
              ignoredUserIds: ["<posting-user-id>"],
              ignoredUserNames: ["<posting-user-name>"],
              websocketChannelScope: "selected",
              websocketChannelIds: ["<channel-id>"],
              websocketDedupeWindowMs: 120000,
              websocketDedupeMaxEntries: 10000,
              websocketDispatchConcurrency: 1,
              websocketDispatchQueueSize: 100
            }
          }
        }
      }
    }
  }
}
```

## Troubleshooting

- A healthy WebSocket means Potassium is receiving live frames. OpenClaw dispatch
  can still drop a frame because the channel is not selected, the sender is
  ignored, the post ID is inside the dedupe window, or the payload is not a
  usable `posted` event.
- A healthy WebSocket does not guarantee typing or status calls were accepted by
  the kChat REST API. Check warnings if typing or online presence does not show.
- WebSocket dispatch is bounded by `websocketDispatchConcurrency` and
  `websocketDispatchQueueSize`. When the queue is full, new post events are
  dropped with `dispatch_queue_full`.
- Drop diagnostics include operational IDs such as post, channel, team, and user
  IDs. They intentionally do not log message text or tokens.
- WebSocket intake is live only. Messages sent while OpenClaw is offline are not
  guaranteed to be backfilled unless another workflow polls known channels.

## Security Notes

Keep bearer/API tokens and webhook verification tokens in environment variables.
Do not commit them to OpenClaw config, docs, tests, or examples.
