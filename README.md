# potassium-openclaw

OpenClaw integration for the prebuilt Potassium CLI command `pot`, including workflows for supported Infomaniak services.

This repository intentionally packages only OpenClaw skill instructions, metadata, tests, and docs. Potassium is distributed separately as the prebuilt `pot` executable.

This is a skills-first package. It does not register native OpenClaw tools and it does not import Node process-spawning APIs. Agents run `pot` through OpenClaw's managed `exec` tool so host command execution stays behind OpenClaw exec policy, allowlists, approvals, sandboxing, and elevated-mode controls.

## Shape

- `.codex-plugin/plugin.json` declares the bundle metadata and bundled skill root.
- `skills/` teaches agents how to use `pot` through OpenClaw managed `exec`.
- `test/` verifies skill metadata and the skills-first package boundary.

## Requirements

- OpenClaw with plugin support.
- Node.js 22 or newer.
- A prebuilt Potassium `pot` binary on the `PATH` visible to OpenClaw.
- `INFOMANIAK_TOKEN` available to the OpenClaw execution environment.
- OpenClaw exec policy that allows or asks for `pot` commands.

Potassium binary releases and package-manager metadata are handled outside this repository:

- Homebrew tap: [OpenCow42/homebrew-tap](https://github.com/OpenCow42/homebrew-tap)
- APT repository: [OpenCow42/apt-repo](https://github.com/OpenCow42/apt-repo)
- Binary releases: [OpenCow42/tool-releases](https://github.com/OpenCow42/tool-releases)

## Installing `pot`

Install `pot` before enabling this OpenClaw plugin. The skills declare `pot` as a required binary, and OpenClaw checks `PATH` when loading skills. If you need a pinned or custom build, put a `pot` wrapper or symlink on `PATH` and allowlist that resolved path.

### Homebrew

```sh
brew install opencow42/tap/potassium
```

Or add the tap explicitly:

```sh
brew tap opencow42/tap
brew install potassium
pot version
```

### APT

```sh
echo 'deb [trusted=yes] https://opencow42.github.io/apt-repo stable main' | sudo tee /etc/apt/sources.list.d/opencow.list
sudo apt update
sudo apt install potassium
pot version
```

Ubuntu 24.04 and 26.04 can use explicit suites instead of the `stable` compatibility alias:

```sh
echo 'deb [trusted=yes] https://opencow42.github.io/apt-repo ubuntu24.04 main' | sudo tee /etc/apt/sources.list.d/opencow.list
```

```sh
echo 'deb [trusted=yes] https://opencow42.github.io/apt-repo ubuntu26.04 main' | sudo tee /etc/apt/sources.list.d/opencow.list
```

The OpenCow APT repository currently uses `trusted=yes`; replace this with a signed `signed-by` setup when the repository publishes a signing key and signed metadata.

### Direct Releases

Manual archives and `.deb` packages are published in [OpenCow42/tool-releases](https://github.com/OpenCow42/tool-releases), with tool-scoped release tags such as [`potassium-0.0.2`](https://github.com/OpenCow42/tool-releases/releases/tag/potassium-0.0.2). Each archive or package has a sibling `.sha256` checksum file. Prefer Homebrew or APT for normal installs so upgrades and uninstall behavior stay with the host package manager.

## Distribution Model

This package should be distributed as an OpenClaw-compatible Codex bundle, preferably through ClawHub with git/archive installs as a fallback. It should not bundle the native `pot` executable or download/build it during install.

The bundled skills follow OpenClaw's documented [`SKILL.md` metadata shape](https://docs.openclaw.ai/tools/skills):

- `homepage` points at the Potassium binary releases.
- `metadata.openclaw.requires.bins` declares `pot`.
- `metadata.openclaw.requires.env` and `primaryEnv` declare `INFOMANIAK_TOKEN`.
- `metadata.openclaw.install` includes the supported Homebrew installer hint for `opencow42/tap/potassium`.

APT is documented as operator setup guidance rather than OpenClaw installer metadata because OpenClaw's skill installer specs currently cover Homebrew, Node, Go, uv, and direct downloads, not APT. Direct download installer metadata is also intentionally omitted for now; the release page remains the source of truth for architecture-specific artifacts and checksum files.

OpenClaw checks `requires.bins` on the host at skill load time. If an agent runs in a container sandbox, install `pot` inside that sandbox with a custom image or sandbox setup command.

## Install in OpenClaw

1. Make `pot` available:

```sh
pot version
```

2. Make the Infomaniak token available to the OpenClaw process as `INFOMANIAK_TOKEN`. Do not put the token in chat and do not pass it as `--token`.

3. Allow `pot` through OpenClaw managed exec.

For a strict allowlist posture:

```sh
openclaw exec-policy set --security allowlist --ask on-miss --ask-fallback deny
openclaw approvals allowlist add "pot"
```

If you want to trust one resolved binary path instead of any `pot` on `PATH`, allowlist the absolute path:

```sh
openclaw approvals allowlist add "/opt/homebrew/bin/pot"
```

4. Install the skills bundle.

From a local checkout:

```sh
openclaw plugins install --link .
```

From a published bundle, once available:

```sh
openclaw plugins install clawhub:opencow/potassium-openclaw
```

5. Verify OpenClaw can see the plugin and skills:

```sh
openclaw plugins inspect potassium --json
openclaw skills check --json
```

After installation, ask OpenClaw to use the Potassium skill. The agent should call `pot` through the built-in `exec` tool, not through native plugin tools.

## Local Development

```sh
npm install
npm test
npm run check
```

Run the optional local binary check when `pot` is installed:

```sh
npm run doctor
```

## Current Boundary

This package assumes Potassium will later expose a release-quality command catalog through `pot`, ideally:

```sh
pot catalog --format json
```

Until then, the bundled skills document the known `pot` command shapes and instruct agents to use `pot <namespace> --help` when unsure.

## Security

Please see [SECURITY.md](SECURITY.md) for supported branches, vulnerability reporting, and credential-handling expectations.
