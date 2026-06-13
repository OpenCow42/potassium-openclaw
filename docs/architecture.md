# Architecture

## Boundary

This repository is the OpenClaw integration layer for Infomaniak workflows. It owns:

- the native OpenClaw plugin entrypoint;
- manifest metadata and tool contracts;
- skill guidance for agents;
- conservative mutation and credential rules;
- the pinned dependency on `liquid-potassium`.

The reusable API client, catalog, discovery logic, Mail application client, and reviewed domain workflows live in `liquid-potassium`.

This repository does not vendor Infomaniak API source, compile native code, or spawn host commands for API work.

## Runtime Flow

1. OpenClaw loads `index.js` through `package.json#openclaw.extensions`.
2. `index.js` builds the plugin config schema from `liquid-potassium/openclaw/tools`.
3. At registration time, the plugin resolves config and registers the `infomaniak_*` tools created by `liquid-potassium`.
4. Tool calls use the SDK's injected `fetch`, `client.workflows`, discovery helpers, Mail application client, or raw operation dispatcher.
5. Credentials are read from `INFOMANIAK_TOKEN` by default, or from the configured `tokenEnvName`.

## Mutation Policy

Mutations are controlled by plugin policy plus explicit user intent.

- `blockMutating` defaults to `true`.
- Mutating workflow, Mail application, and raw operation calls require `confirm_mutating=true` when mutation is allowed.
- Domain and operation allow/deny policy applies before the SDK call is made.
- Skills must not encourage hidden writes, guessed IDs, or fallback raw calls when a reviewed workflow exists.

## Dependency Strategy

Until `liquid-potassium` is published to npm, this package depends on a specific GitHub commit. The pinned commit includes built `dist` output because OpenClaw git installs use npm with lifecycle scripts disabled.

See [Liquid Potassium Integration](liquid-potassium-integration.md) for details.
