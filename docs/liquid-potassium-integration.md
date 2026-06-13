# Liquid Potassium Integration

## Decision

Use `liquid-potassium` as a Node dependency pinned to the published npm package version:

```json
"liquid-potassium": "0.1.0"
```

The package is published at <https://www.npmjs.com/package/liquid-potassium/v/0.1.0>.

## Published Package Requirements

OpenClaw installs may run dependency installation with lifecycle scripts disabled. The published `liquid-potassium` package must therefore include built runtime output instead of relying on `prepare` or another install-time build.

Version `0.1.0` includes built runtime files for the OpenClaw entrypoints, so imports such as `liquid-potassium/openclaw/tools` work without install-time build scripts.

## OpenClaw Package Responsibilities

- Pin the exact npm package version.
- Register tools through the Node SDK.
- Keep skills aligned with registered tool names.
- Keep Infomaniak credentials in `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Keep mutation tooling disabled by default through plugin config.
- Test package metadata and plugin registration without live Infomaniak API calls.

## Library Responsibilities

- Own API request construction and response handling.
- Own workflow action metadata and execution.
- Own discovery recipes and no-public-discovery explanations.
- Own Mail application route handling.
- Preserve raw upload request bodies and local `file_path` upload support.

## Upgrade Path

When `liquid-potassium` publishes a new version, update the exact dependency version and regenerate the lockfile only after validating the published package includes the runtime files needed by this adapter.
