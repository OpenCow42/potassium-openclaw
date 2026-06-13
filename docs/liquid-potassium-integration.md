# Liquid Potassium Integration

## Decision

Use `liquid-potassium` as a Node dependency pinned to a specific GitHub commit:

```json
"liquid-potassium": "github:OpenCow42/liquidPotassium#28450a310eeed5ffb18e05e9a93f60be506260b8"
```

Do not publish `liquid-potassium` to npm yet. Do not create a tag or release just for this migration.

## Why the Commit Includes `dist`

OpenClaw git installs run dependency installation with lifecycle scripts disabled. A GitHub dependency that needs `prepare` to build its runtime output is therefore not sufficient for this package.

The pinned `liquid-potassium` commit keeps package version `0.1.0` and tracks built runtime files under `dist/src` and `dist/openclaw`, so imports such as `liquid-potassium/openclaw/tools` work without install-time build scripts.

## OpenClaw Package Responsibilities

- Pin the exact GitHub commit.
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

## Future Publish Path

When `liquid-potassium` is ready for npm publication, replace the GitHub dependency with a semver range and regenerate the lockfile. Until then, update the commit pin only after the target GitHub commit has been pushed and validated.
