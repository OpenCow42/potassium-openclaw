# Potassium for OpenClaw

Potassium packages Infomaniak workflows for OpenClaw. It installs as a native
OpenClaw plugin, registers Infomaniak tools backed by the published
`liquid-potassium` SDK, and ships skills that help agents use those tools with
the right safety defaults.

It also includes a dedicated `kchat` OpenClaw channel for live Infomaniak kChat
communication: outbound posts, inbound webhook or WebSocket events, threaded
replies, typing indicators, and optional online presence.

## Highlights

- Native OpenClaw plugin. No external executable runtime and no vendored SDK
  source.
- Infomaniak tools for discovery, reviewed workflows, Mail application calls,
  and raw API calls when policy allows them.
- Skills for kDrive, Mail, kChat, URL shortener, and general Infomaniak tasks.
- Dedicated kChat channel capability for post/reply workflows inside OpenClaw.
- Environment-only credential handling. Direct bearer-token config is rejected.
- Conservative mutation policy. Mutating operations are blocked by default.
- Exact dependency pin on `liquid-potassium@0.3.0`.

## Status

This repository is the OpenClaw adapter and package layer for Infomaniak. The
current GitHub release is `0.3.0`. Package metadata is ready for public npm or
ClawHub publication; until it is published there, install from a local checkout
while developing or from a pinned GitHub release for regular use.

## Requirements

- OpenClaw `2026.6.6` or newer.
- Node.js 22 or newer.
- `INFOMANIAK_TOKEN` available to the OpenClaw process, unless plugin config
  sets another `tokenEnvName`.

## Install

From this repository checkout:

```sh
openclaw plugins install --link .
openclaw plugins enable potassium
```

From GitHub, pin a reviewed release or commit:

```sh
openclaw plugins install git:github.com/OpenCow42/potassium-openclaw@0.3.0
openclaw plugins enable potassium
```

When replacing an existing copied install, pass `--force` to the same install
command. Linked installs point directly at the checkout and do not need
`--force`.

If OpenClaw runs as a service, restart the gateway after installing or changing
plugin code:

```sh
openclaw gateway restart
```

## Configure

Default credential injection reads `INFOMANIAK_TOKEN`. Keep bearer/API tokens in
environment variables only.

```sh
export INFOMANIAK_TOKEN="..."
```

Minimal explicit config:

```sh
openclaw config patch --stdin <<'JSON5'
{
  plugins: {
    entries: {
      potassium: {
        enabled: true,
        config: {
          tokenEnvName: "INFOMANIAK_TOKEN",
          blockMutating: true
        }
      }
    }
  }
}
JSON5
```

Useful plugin config fields:

- `tokenEnvName`: environment variable name for the Infomaniak bearer token,
  default `INFOMANIAK_TOKEN`.
- `baseUrl`: optional Infomaniak API base URL override.
- `mailApplicationBaseUrl`: optional Mail application API base URL override.
- `allowedDomains`: optional domain allowlist.
- `allowedOperations`: optional backing operation allowlist.
- `deniedOperations`: optional backing operation denylist.
- `blockMutating`: blocks mutating operations when `true`, default `true`.

## Tools

Potassium registers these native OpenClaw tools:

- `infomaniak_domains`
- `infomaniak_search`
- `infomaniak_describe`
- `infomaniak_discover`
- `infomaniak_mail_application`
- `infomaniak_workflow_list`
- `infomaniak_workflow_describe`
- `infomaniak_workflow_run`
- `infomaniak_call`

Prefer reviewed workflow tools for domain actions. Use
search/describe/discover/call only when a reviewed workflow does not fit.

## Skills

The package ships OpenClaw/Codex skill guidance under `skills/`:

- `potassium`: general Infomaniak tool selection and safety rules. See
  [docs/potassium.md](docs/potassium.md).
- `kdrive-writing`: kDrive workflows. See
  [docs/kdrive-writing.md](docs/kdrive-writing.md).
- `mail-handling`: Infomaniak Mail workflows. See
  [docs/mail-handling.md](docs/mail-handling.md).
- `kchat-posting`: kChat posting and channel guidance. See
  [docs/kchat-channel.md](docs/kchat-channel.md).
- `url-shortener`: URL shortener workflows. See
  [docs/url-shortener.md](docs/url-shortener.md).

## kChat Channel

Potassium declares a dedicated OpenClaw channel capability named `kchat`. It can
send messages to kChat, receive live events, and route OpenClaw replies back into
the correct kChat channel or thread.

The channel supports:

- outbound posts to `id:<channel_id>`, `#channel`, `channel`, or
  `team/channel` destinations;
- inbound receive modes: `webhook`, `websocket`, `both`, or `disabled`;
- hosted Infomaniak Echo/Pusher WebSocket receive;
- plain Mattermost WebSocket receive for compatible servers;
- selected-channel WebSocket intake by default; all-channel intake requires
  `websocketChannelScope: "all"`;
- duplicate suppression and bounded dispatch queueing;
- native typing indicators for replies;
- optional online status updates when OpenClaw starts preparing a reply.

See [docs/kchat-channel.md](docs/kchat-channel.md) for setup, configuration,
routing, and troubleshooting details.

## Verify

Check the installed plugin and runtime registration:

```sh
openclaw plugins inspect potassium --runtime --json
openclaw plugins list --enabled
openclaw doctor
```

After verification, ask OpenClaw to use the Potassium skills for an Infomaniak
task. The plugin should register the `infomaniak_*` tools listed above.

## Local Development

```sh
npm install
npm test
npm run check
```

The default test suite uses metadata and mocked registration checks only. It
does not call live Infomaniak APIs.

## Documentation

- [Architecture](docs/architecture.md)
- [Liquid Potassium Integration](docs/liquid-potassium-integration.md)
- [kChat Channel](docs/kchat-channel.md)
- [Potassium Skill](docs/potassium.md)
- [kDrive Writing](docs/kdrive-writing.md)
- [Mail Handling](docs/mail-handling.md)
- [URL Shortener](docs/url-shortener.md)

## Security

Please see [SECURITY.md](SECURITY.md) for supported branches, vulnerability
reporting, and credential-handling expectations.

Bearer/API tokens and webhook verification tokens must stay in environment
variables. Do not place them in chat, docs, tests, OpenClaw config files, or
committed config.

## License

This project is licensed under [Apache-2.0](LICENSE).
