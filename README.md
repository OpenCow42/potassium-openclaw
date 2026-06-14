# potassium-openclaw

OpenClaw plugin and skills for Infomaniak workflows backed by the `liquid-potassium` Node SDK.

This package no longer depends on an external executable. It registers native OpenClaw tools from `liquid-potassium` and ships skills that teach agents when to use those tools.

## License

This project is licensed under [Apache-2.0](LICENSE).

## Shape

- `index.js` registers the OpenClaw plugin and delegates tool construction to `liquid-potassium`.
- `openclaw.plugin.json` declares the native plugin contract and tool names.
- `.codex-plugin/plugin.json` keeps the Codex bundle metadata for local plugin development.
- `skills/` provides task guidance for kDrive, Mail, kChat, URL shortener, and general Infomaniak workflows.
- `docs/` records the architecture and dependency strategy.

## Dependency

`liquid-potassium` is consumed from npm and pinned to the published package version:

```json
"liquid-potassium": "0.3.0"
```

The published package includes built runtime output, so imports such as `liquid-potassium/openclaw/tools` work without install-time build scripts.

## Requirements

- OpenClaw with native plugin support.
- Node.js 22 or newer.
- `INFOMANIAK_TOKEN` available to the OpenClaw process, unless plugin config sets another `tokenEnvName`.

## Tools

The plugin registers these tools:

- `infomaniak_domains`
- `infomaniak_search`
- `infomaniak_describe`
- `infomaniak_discover`
- `infomaniak_mail_application`
- `infomaniak_workflow_list`
- `infomaniak_workflow_describe`
- `infomaniak_workflow_run`
- `infomaniak_call`

Prefer workflow tools for reviewed domain actions. Use search/describe/discover/call only when a reviewed workflow does not fit.

## kChat Channel

The plugin also declares a dedicated OpenClaw channel capability named `kchat` for outbound kChat replies and inbound kChat events. Configure it under `channels.kchat` inside the Potassium plugin config.

Supported kChat channel config:

- `teamName`: default kChat team name for resolving channel names.
- `apiBaseUrl`: optional team-specific kChat API base URL. When omitted, Potassium derives `https://<teamName>.kchat.infomaniak.com` from a DNS-safe `teamName`.
- `defaultChannel`: default outbound destination.
- `setOnline`: optional `set_online` value sent with outbound posts.
- `receiveMode`: inbound receive mode, one of `webhook`, `websocket`, `both`, or `disabled`. Defaults to `webhook`.
- `websocketProtocol`: `infomaniak-echo` for hosted kChat, or `mattermost` for a plain Mattermost `/api/v4/websocket` server. Defaults to `infomaniak-echo`.
- `webhookPath`: gateway path for inbound outgoing webhooks, default `/channels/kchat/webhook`.
- `outgoingWebhookTokenEnvName`: environment variable for the webhook verification token, default `INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN`.
- `ignoredUserIds`: sender user IDs to ignore for inbound events.
- `ignoredUserNames`: sender usernames to ignore for inbound events.
- `websocketUrl`: optional explicit WebSocket URL.
- `websocketHost`: Infomaniak Echo socket host, default `websocket.kchat.infomaniak.com`.
- `websocketAppKey`: Infomaniak Echo/Pusher app key, default `kchat-key`.
- `websocketAuthEndpoint`: optional Echo private-channel auth endpoint, default `<apiBaseUrl>/broadcasting/auth`.
- `websocketSubscriptions`: optional explicit Echo subscription channel names.
- `websocketTeamId`: optional kChat team ID override for Echo subscriptions.
- `websocketTeamUserId`: optional kChat team user ID override for Echo subscriptions.
- `websocketChannelScope`: WebSocket intake scope, either `all` or `selected`. When omitted, Potassium preserves the legacy shorthand: configured `websocketChannelIds` means `selected`, and no channel IDs means `all`.
- `websocketChannelIds`: optional list of kChat channel IDs accepted from the WebSocket stream when the scope is `selected`.
- `websocketDedupeWindowMs`: milliseconds to suppress duplicate WebSocket posts by post id. Defaults to `120000`; set `0` to disable duplicate suppression.

Outbound destinations support `id:<channel_id>`, `#channel`, `channel`, and `team/channel`. Thread replies use the root post or reply id as the kChat thread root id.

Inbound setup is intentionally environment-only for secrets. For webhook mode, create a kChat outgoing webhook in Infomaniak/kChat that points at the OpenClaw gateway URL plus `webhookPath`, set the webhook verification token in `INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN` or the configured env var, and add the posting account to `ignoredUserIds` or `ignoredUserNames` to avoid reply loops. kChat/Mattermost outgoing webhook payloads may arrive as JSON, form-urlencoded fields, or a form `payload` JSON value.

For WebSocket mode against hosted Infomaniak kChat, set `receiveMode: "websocket"` or `"both"` and keep `INFOMANIAK_TOKEN` available to the OpenClaw process. The adapter connects to Infomaniak's Echo/Pusher-compatible socket, resolves the team/user IDs from `teamName`, authenticates `private-team.<team_id>` and `presence-teamUser.<user_id>` through `/broadcasting/auth`, and receives `posted` events without requiring a public callback URL. Set `websocketChannelScope: "all"` to accept every visible channel, or `websocketChannelScope: "selected"` with `websocketChannelIds` to limit which kChat channels can trigger OpenClaw. For compatibility, omitting `websocketChannelScope` still accepts all visible channels when `websocketChannelIds` is empty. For a plain Mattermost server, set `websocketProtocol: "mattermost"` and optionally `websocketUrl`.

WebSocket troubleshooting notes:

- A healthy socket only means Potassium is receiving live frames. OpenClaw dispatch can still drop a frame because the channel is not selected, the sender is ignored, the post id is already inside the dedupe window, or the payload is not a usable `posted` event.
- Drop diagnostics log reason and identifiers such as post, channel, team, and user ids. They intentionally do not log message text or tokens.
- WebSocket intake is live only. Messages sent while OpenClaw is offline are not guaranteed to be backfilled unless another workflow polls known channels.

Example non-secret kChat config:

```json5
{
  channels: {
    kchat: {
      enabled: true,
      teamName: "example-team",
      apiBaseUrl: "https://example-team.kchat.infomaniak.com",
      defaultChannel: "id:<channel-id>",
      setOnline: false,
      receiveMode: "websocket",
      websocketProtocol: "infomaniak-echo",
      webhookPath: "/channels/kchat/webhook",
      outgoingWebhookTokenEnvName: "INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN",
      ignoredUserIds: ["<posting-user-id>"],
      ignoredUserNames: ["<posting-user-name>"],
      websocketChannelScope: "selected",
      websocketChannelIds: ["<channel-id>"],
      websocketDedupeWindowMs: 120000
    }
  }
}
```

The same channel could also be addressed as `#support`, `support`, or `example-team/support` when `teamName` is available. Bearer/API tokens and webhook verification tokens must stay in environment variables and must never be committed to plugin config.

## Configuration

Default credential injection reads `INFOMANIAK_TOKEN`. Direct bearer-token config is intentionally rejected by this adapter; use an environment variable instead. Supported plugin config includes:

- `tokenEnvName`: environment variable name for the bearer token, default `INFOMANIAK_TOKEN`.
- `baseUrl`: optional Infomaniak API base URL override.
- `mailApplicationBaseUrl`: optional Mail application API base URL override.
- `allowedDomains`: optional domain allowlist.
- `allowedOperations`: optional backing operation allowlist.
- `deniedOperations`: optional backing operation denylist.
- `blockMutating`: defaults to `true`.

Do not place bearer tokens in chat, docs, tests, OpenClaw config files, or committed config.

## Install in OpenClaw

The package is not published to npm or ClawHub yet. Install it from a local checkout while developing, or from a pinned GitHub commit for regular use.

### 1. Prepare Credentials

Create an Infomaniak API token with the product scopes needed for the workflows you want to use, then expose it to the OpenClaw process:

```sh
export INFOMANIAK_TOKEN="..."
```

Keep the token out of chat, docs, committed config, and shell history. If OpenClaw runs as a long-lived service, make sure `INFOMANIAK_TOKEN` is present in that service environment before starting or restarting it.

### 2. Install The Plugin

From this repository checkout:

```sh
openclaw plugins install --link .
```

From GitHub, pin a reviewed commit:

```sh
openclaw plugins install git:github.com/OpenCow42/potassium-openclaw@<commit-sha>
```

Use `--force` with the same install command when replacing an existing install.

### 3. Enable And Configure

Enable the plugin:

```sh
openclaw plugins enable potassium
```

The default configuration reads `INFOMANIAK_TOKEN`, keeps mutating operations blocked, and leaves all supported domains available. To make those defaults explicit or to add policy constraints, patch OpenClaw config:

```sh
openclaw config patch --stdin <<'JSON5'
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
              receiveMode: "websocket",
              websocketProtocol: "infomaniak-echo",
              outgoingWebhookTokenEnvName: "INFOMANIAK_KCHAT_OUTGOING_WEBHOOK_TOKEN",
              ignoredUserIds: ["<posting-user-id>"],
              ignoredUserNames: ["<posting-user-name>"],
              websocketChannelScope: "selected",
              websocketChannelIds: ["<channel-id>"],
              websocketDedupeWindowMs: 120000
            }
          }
        }
      }
    }
  }
}
JSON5
```

Omit `allowedDomains` to allow every supported Infomaniak domain. Keep `blockMutating: true` unless you intentionally want write-capable tools available; mutating tool calls still require explicit confirmation from the caller.

### 4. Verify Setup

Check the installed plugin and runtime registration:

```sh
openclaw plugins inspect potassium --runtime --json
openclaw plugins list --enabled
openclaw doctor
```

After verification, ask OpenClaw to use the Potassium skills for an Infomaniak task. The plugin should register the `infomaniak_*` tools listed above.

## Local Development

```sh
npm install
npm test
npm run check
```

The default test suite uses metadata and mocked registration checks only. It does not call live Infomaniak APIs.

## Security

Please see [SECURITY.md](SECURITY.md) for supported branches, vulnerability reporting, and credential-handling expectations.
