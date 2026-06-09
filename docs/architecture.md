# Architecture

## Boundary

Potassium is the system of record for Infomaniak behavior. This package is a thin OpenClaw skills adapter that:

- declares the prebuilt Potassium `pot` binary as a skill requirement,
- declares `INFOMANIAK_TOKEN` as the required credential environment variable,
- teaches agents to run `pot` through OpenClaw's managed `exec` tool,
- keeps binary execution behind OpenClaw exec policy, allowlists, approvals, sandboxing, and elevated-mode controls,
- avoids native plugin process spawning.

This repository does not compile Swift, vendor Potassium, register native OpenClaw tools, or import Node process-spawning APIs.

## Release Direction

1. Potassium publishes signed or checksummed binary artifacts whose executable is named `pot` through [OpenCow42/tool-releases](https://github.com/OpenCow42/tool-releases).
2. Homebrew installs those prebuilt artifacts through [OpenCow42/homebrew-tap](https://github.com/OpenCow42/homebrew-tap), and Debian-family systems can use [OpenCow42/apt-repo](https://github.com/OpenCow42/apt-repo).
3. This OpenClaw integration is distributed as a Codex-compatible bundle through ClawHub, git, or archives.
4. The bundled skills use documented OpenClaw skill metadata: top-level `homepage`, `metadata.openclaw.requires.bins`, `requires.env`, `primaryEnv`, and a Homebrew installer hint.
5. Operators allow `pot` through OpenClaw exec approvals, either by bare command name or by resolved absolute path.
6. The bundled skills teach the agent when and how to use `pot` through managed `exec`.

See [Pot Installation Strategy](pot-installation-strategy.md) for the package-manager and execution boundary.

## Mutation Policy

Mutations are controlled by user intent plus OpenClaw exec policy. The skills treat create, update, delete, upload, move, send, schedule, share, and similar commands as mutations and instruct agents to run them only when explicitly requested.

At the host boundary, operators should keep `pot` behind OpenClaw exec approvals. A strict local setup is:

```sh
openclaw exec-policy set --security allowlist --ask on-miss --ask-fallback deny
openclaw approvals allowlist add "pot"
```

Use an absolute allowlist path when the operator wants to trust only one installed binary.
