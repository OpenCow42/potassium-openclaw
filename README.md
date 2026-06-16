# Potassium for OpenClaw

Potassium brings Infomaniak workflows into OpenClaw as a native plugin. It
registers OpenClaw tools backed by the published `liquid-potassium` Node SDK,
ships agent skills for common Infomaniak tasks, and adds a dedicated kChat
channel for live chat workflows.

Quick setup website: <https://opencow42.github.io/potassium-openclaw/#install>

The plugin is designed as an adapter layer: this repository owns the OpenClaw
manifest, package metadata, skill guidance, docs, and safety defaults, while
`liquid-potassium` owns the reusable Infomaniak API client and reviewed
workflow implementations.

## What It Adds

- Native OpenClaw tools for Infomaniak discovery, reviewed workflows, Mail
  application actions, and controlled raw API calls.
- Skills for kDrive, Mail, kChat, URL shortener, and general Infomaniak work.
- A dedicated `kchat` OpenClaw channel for outbound posts, media posts, inbound
  webhook or WebSocket events, threaded replies, typing indicators, and optional
  online presence.
- Conservative credential handling: bearer tokens stay in environment
  variables, and direct token config is rejected.
- Conservative mutation handling: mutating operations are blocked by default and
  require explicit user intent plus tool-level confirmation when enabled.
- A small package surface with no vendored SDK source and no external executable
  runtime.

## Capabilities

Potassium is useful when an OpenClaw agent needs to work with Infomaniak
services without hand-rolling HTTP calls or exposing credentials in prompts.

| Area | Capabilities |
| --- | --- |
| Discovery | List available domains, search operation metadata, describe API capabilities, and discover reviewed workflow coverage. |
| kDrive | Resolve drives and folders, create directories or default files, upload local files, and verify results when mutations are allowed. |
| Mail | List mailboxes and folders, review unread threads, read messages, move messages, and manage drafts through the Mail application API. |
| kChat | Post text or media, reply in threads, receive webhook or WebSocket events, publish typing indicators, and preserve inbound reply context. |
| URL shortener | Check quota, list short links, create `chk.me` links, and update expiration dates. |
| Policy | Apply domain allowlists, operation allowlists or denylists, and mutation blocking before SDK calls run. |

## Install

For a guided install flow, start with the
[quick setup website](https://opencow42.github.io/potassium-openclaw/#install).

Requirements:

- OpenClaw `2026.6.6` or newer.
- Node.js 22 or newer.
- `INFOMANIAK_TOKEN` available in the OpenClaw process environment, unless
  plugin config sets another `tokenEnvName`.

Install from ClawHub after the package is published:

```sh
openclaw plugins install clawhub:@opencow42/potassium-openclaw
openclaw plugins enable potassium
```

Install from npm as a fallback:

```sh
openclaw plugins install npm:@opencow42/potassium-openclaw
openclaw plugins enable potassium
```

Install from a pinned GitHub release or tag:

```sh
openclaw plugins install git:github.com/OpenCow42/potassium-openclaw@0.4.0
openclaw plugins enable potassium
```

For local development:

```sh
openclaw plugins install --link .
openclaw plugins enable potassium
```

If OpenClaw runs as a service, restart the gateway after installing or changing
plugin code:

```sh
openclaw gateway restart
```

## Configure

Keep Infomaniak bearer tokens in environment variables only:

```sh
export INFOMANIAK_TOKEN="..."
```

For supported OpenClaw credential fields, prefer the built-in SecretRef
workflow instead of plaintext config:

```sh
openclaw secrets configure
openclaw secrets audit --check
openclaw secrets reload
```

Potassium config should keep only the environment variable name for the
Infomaniak token. Do not store the token value in OpenClaw memory or plugin
config.

Natural-language setup prompt for OpenClaw:

```text
Use OpenClaw's native secrets feature to configure my Infomaniak token for Potassium. Do not store the token in memory, chat history, plugin config, docs, logs, or committed files. Use SecretRefs or the Gateway environment as appropriate, keep Potassium configured with tokenEnvName: "INFOMANIAK_TOKEN", run openclaw secrets audit --check, then reload secrets or restart the Gateway. If you need the token value, ask me to enter it only through the OpenClaw secrets flow or a trusted local shell, not in chat.
```

Minimal explicit plugin config:

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

Common plugin config fields:

- `tokenEnvName`: environment variable name for the Infomaniak bearer token,
  default `INFOMANIAK_TOKEN`.
- `baseUrl`: optional Infomaniak API base URL override.
- `mailApplicationBaseUrl`: optional Mail application API base URL override.
- `allowedDomains`: optional domain allowlist such as `kdrive`, `mail`, or
  `kchat`.
- `allowedOperations`: optional normalized operation ID allowlist.
- `deniedOperations`: optional normalized operation ID denylist.
- `blockMutating`: blocks mutating operations when `true`, default `true`.

## OpenClaw Tools

Potassium registers these native tools:

- `infomaniak_domains`
- `infomaniak_search`
- `infomaniak_describe`
- `infomaniak_discover`
- `infomaniak_mail_application`
- `infomaniak_workflow_list`
- `infomaniak_workflow_describe`
- `infomaniak_workflow_run`
- `infomaniak_call`

Prefer reviewed workflow tools for domain actions. Use lower-level search,
describe, discover, or raw call tools only when a reviewed workflow does not fit
and policy allows the operation.

## Skill Documentation

Skill-specific guidance lives in dedicated files under `docs/skills/`:

- [General Potassium guidance](docs/skills/potassium.md)
- [kDrive writing](docs/skills/kdrive-writing.md)
- [Mail handling](docs/skills/mail-handling.md)
- [kChat posting](docs/skills/kchat-posting.md)
- [URL shortener](docs/skills/url-shortener.md)

The executable skill instructions shipped to agents live under `skills/`.

## kChat Channel

Potassium declares a dedicated OpenClaw channel capability named `kchat`. It can
send messages to kChat, receive inbound events, and route OpenClaw replies back
into the correct channel or thread.

Use WebSocket receive mode for most installs because it does not require a
public callback URL. Use webhook receive mode when you already expose a public
OpenClaw gateway URL and prefer kChat outgoing webhooks.

See the [kChat channel guide](docs/kchat-channel.md) for setup examples,
configuration fields, inbound routing behavior, WebSocket receive, webhook
receive, typing indicators, and troubleshooting.

## Verify

Check the installed plugin and runtime registration:

```sh
openclaw plugins inspect potassium --runtime --json
openclaw plugins list --enabled
openclaw doctor
```

After verification, ask OpenClaw to use the Potassium skills for an Infomaniak
task. The plugin should register the `infomaniak_*` tools listed above.

## Project Docs

- [Architecture](docs/architecture.md)
- [Liquid Potassium integration](docs/liquid-potassium-integration.md)
- [kChat channel guide](docs/kchat-channel.md)
- [Skill documentation](docs/skills/potassium.md)

## Local Development

```sh
npm install
npm test
npm run check
```

The default test suite uses metadata and mocked registration checks only. It
does not call live Infomaniak APIs.

## Security

Please see [SECURITY.md](SECURITY.md) for supported branches, vulnerability
reporting, and credential-handling expectations.

Bearer/API tokens and webhook verification tokens must stay in environment
variables. Do not place them in chat, docs, tests, OpenClaw config files, or
committed config.

## License

This project is licensed under [Apache-2.0](LICENSE).
