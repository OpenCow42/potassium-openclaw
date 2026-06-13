# AGENTS.md

## Repository Purpose

This repository packages a native OpenClaw plugin and skills for Infomaniak workflows backed by the `liquid-potassium` Node SDK.

- Do not reintroduce an external executable runtime.
- Do not vendor `liquid-potassium` source here.
- Pin `liquid-potassium` to an exact published npm version.
- Keep this repository as the OpenClaw adapter, manifest, packaging, docs, and skill layer.

## Safety Rules

- Never store or print Infomaniak bearer tokens.
- Use `INFOMANIAK_TOKEN` or the configured `tokenEnvName` for credential injection.
- Keep mutation tools disabled by default and covered by tests.
- Do not call live Infomaniak APIs from this repository's default test suite.

## Validation

Run:

```sh
npm test
npm run check
```
