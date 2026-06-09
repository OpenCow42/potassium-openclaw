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

1. Potassium publishes signed or checksummed binary artifacts whose executable is named `pot` through [OpenCow42/tool-releases](https://github.com/OpenCow42/tool-releases).
2. Homebrew installs those prebuilt artifacts through [OpenCow42/homebrew-tap](https://github.com/OpenCow42/homebrew-tap), and Debian-family systems can use [OpenCow42/apt-repo](https://github.com/OpenCow42/apt-repo).
3. This OpenClaw plugin is distributed as a native OpenClaw package through ClawHub or npm.
4. The bundled skills use documented OpenClaw skill metadata: top-level `homepage`, `metadata.openclaw.requires.bins`, `requires.env`, `primaryEnv`, and a Homebrew installer hint.
5. The bundled skills teach the agent when to use the tools.
6. The plugin accepts `potPath` for pinned binaries when `pot` is not on `PATH`.

See [Pot Installation Strategy](pot-installation-strategy.md) for the package-manager boundary.

## Mutation Policy

`infomaniak_mutate` is optional and default-denied. Enable it only after the operator has configured OpenClaw tool allowlists and set:

```json5
{ plugins: { entries: { infomaniak: { config: { mutationMode: "allow" } } } } }
```

Per-call approval hooks can be added later, but the initial scaffold fails closed.
