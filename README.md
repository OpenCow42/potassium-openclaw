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
          allowedDomains: ["kdrive", "mail", "kchat", "urlShortener"]
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
