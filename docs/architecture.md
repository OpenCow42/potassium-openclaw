# Architecture

## Boundary

Potassium is the system of record for Infomaniak behavior. This package is a thin OpenClaw adapter that:

- discovers a prebuilt Potassium `pot` binary,
- validates OpenClaw tool parameters,
- injects credentials through environment variables,
- spawns Potassium through `pot` without a shell,
- parses JSON output when requested,
- redacts secrets from errors,
- keeps write paths contained.

This repository does not compile Swift and does not know about Potassium's internal dependencies.

## Release Direction

1. Potassium publishes signed or checksummed binary artifacts whose executable is named `pot`.
2. Homebrew installs those prebuilt artifacts.
3. This OpenClaw plugin requires the `pot` command on `PATH` or accepts `potPath`.
4. The bundled skill teaches the agent when to use the tools.

See [Pot Installation Strategy](pot-installation-strategy.md) for the package-manager boundary.

## Mutation Policy

`infomaniak_mutate` is optional and default-denied. Enable it only after the operator has configured OpenClaw tool allowlists and set:

```json5
{ plugins: { entries: { infomaniak: { config: { mutationMode: "allow" } } } } }
```

Per-call approval hooks can be added later, but the initial scaffold fails closed.
