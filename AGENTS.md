# AGENTS.md

## Repository Purpose

This repository packages the Potassium CLI command `pot` for OpenClaw. It should remain an integration layer:

- Do not vendor Potassium source here.
- Do not depend on `potassiumChannel`.
- Do not build Swift packages from this repository.
- Treat `pot` as the prebuilt Potassium executable discovered on `PATH` or configured with `potPath`.

## Safety Rules

- Never store or print Infomaniak bearer tokens.
- Do not pass `--token` to `pot` from OpenClaw tools.
- Use `INFOMANIAK_TOKEN` or the configured `tokenEnvName` for credential injection.
- Keep mutation tools disabled by default and covered by tests.
- Use fake binaries in tests; do not call live Infomaniak APIs from this repository's default test suite.

## Validation

Run:

```sh
npm test
npm run check
```

When a local `pot` binary is available:

```sh
npm run doctor
```
