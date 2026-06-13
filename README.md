# potassium-openclaw

OpenClaw plugin and skills for Infomaniak workflows backed by the `liquid-potassium` Node SDK.

This package no longer depends on an external executable. It registers native OpenClaw tools from `liquid-potassium` and ships skills that teach agents when to use those tools.

## Shape

- `index.js` registers the OpenClaw plugin and delegates tool construction to `liquid-potassium`.
- `openclaw.plugin.json` declares the native plugin contract and tool names.
- `.codex-plugin/plugin.json` keeps the Codex bundle metadata for local plugin development.
- `skills/` provides task guidance for kDrive, Mail, kChat, URL shortener, and general Infomaniak workflows.
- `docs/` records the architecture and dependency strategy.

## Dependency

`liquid-potassium` is consumed from npm and pinned to the published package version:

```json
"liquid-potassium": "0.1.0"
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

## Configuration

Default credential injection reads `INFOMANIAK_TOKEN`. Supported plugin config includes:

- `tokenEnvName`: environment variable name for the bearer token, default `INFOMANIAK_TOKEN`.
- `baseUrl`: optional Infomaniak API base URL override.
- `mailApplicationBaseUrl`: optional Mail application API base URL override.
- `allowedDomains`: optional domain allowlist.
- `allowedOperations`: optional backing operation allowlist.
- `deniedOperations`: optional backing operation denylist.
- `blockMutating`: defaults to `true`.

Do not place bearer tokens in chat, docs, tests, or committed config.

## Install in OpenClaw

From a local checkout:

```sh
openclaw plugins install --link .
```

From GitHub:

```sh
openclaw plugins install git:github.com/OpenCow42/potassium-openclaw@<commit>
```

Enable and configure the plugin through OpenClaw's normal plugin configuration flow.

## Local Development

```sh
npm install
npm test
npm run check
```

The default test suite uses metadata and mocked registration checks only. It does not call live Infomaniak APIs.

## Security

Please see [SECURITY.md](SECURITY.md) for supported branches, vulnerability reporting, and credential-handling expectations.
