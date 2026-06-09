# potassium-openclaw

OpenClaw integration for Infomaniak through the prebuilt Potassium CLI command `pot`.

This repository intentionally packages only the OpenClaw layer: plugin runtime, tool contracts, skill instructions, tests, and docs. Potassium is distributed separately as the prebuilt `pot` executable.

## Shape

- `openclaw.plugin.json` declares the `infomaniak` plugin and its tools.
- `src/index.js` registers OpenClaw tools.
- `src/pot-runner.js` safely spawns the Potassium `pot` binary.
- `skills/` teaches agents how to use the tools for Infomaniak workflows.
- `test/` uses fake Potassium `pot` binaries and never calls Infomaniak.

## Requirements

- OpenClaw with plugin support.
- Node.js 22 or newer.
- A prebuilt Potassium `pot` binary on `PATH`, or an absolute `potPath` in plugin config.
- `INFOMANIAK_TOKEN` available to the OpenClaw agent process, or a custom `tokenEnvName`.

Potassium binary releases and package-manager metadata are handled outside this repository:

- Homebrew tap: [OpenCow42/homebrew-tap](https://github.com/OpenCow42/homebrew-tap)
- APT repository: [OpenCow42/apt-repo](https://github.com/OpenCow42/apt-repo)
- Binary releases: [OpenCow42/tool-releases](https://github.com/OpenCow42/tool-releases)

## Installing `pot`

Install `pot` before enabling this OpenClaw plugin. The plugin discovers `pot` on `PATH`; if it is installed somewhere custom, set `potPath` in plugin config.

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

This package should be distributed as a native OpenClaw plugin, preferably through ClawHub with npm as a fallback. It should not bundle the native `pot` executable or download/build it during plugin install.

The bundled skills follow OpenClaw's documented [`SKILL.md` metadata shape](https://docs.openclaw.ai/tools/skills):

- `homepage` points at the Potassium binary releases.
- `metadata.openclaw.requires.bins` declares `pot`.
- `metadata.openclaw.requires.env` and `primaryEnv` declare `INFOMANIAK_TOKEN`.
- `metadata.openclaw.install` includes the supported Homebrew installer hint for `opencow42/tap/potassium`.

APT is documented as operator setup guidance rather than OpenClaw installer metadata because OpenClaw's skill installer specs currently cover Homebrew, Node, Go, uv, and direct downloads, not APT. Direct download installer metadata is also intentionally omitted for now; the release page remains the source of truth for architecture-specific artifacts and checksum files.

OpenClaw checks `requires.bins` on the host at skill load time. If an agent runs in a container sandbox, install `pot` inside that sandbox with a custom image or sandbox setup command.

## Local Setup

```sh
npm install
npm test
npm run check
```

Install the plugin locally:

```sh
openclaw plugins install --link .
openclaw plugins enable infomaniak
openclaw plugins inspect infomaniak --runtime --json
```

If `pot` is not on `PATH`, configure an explicit binary path:

```json5
{
  plugins: {
    entries: {
      infomaniak: {
        enabled: true,
        config: {
          potPath: "/absolute/path/to/pot",
          tokenEnvName: "INFOMANIAK_TOKEN",
          defaultFormat: "json",
          mutationMode: "deny",
          outputRoot: "/Users/me/Downloads/infomaniak"
        }
      }
    }
  }
}
```

## Tools

- `infomaniak_search_commands`: search the seeded Potassium command catalog.
- `infomaniak_read`: run read-only Potassium commands through `pot`.
- `infomaniak_mutate`: run mutation commands. This tool is optional and denied by default.

All tools spawn Potassium through the `pot` executable with argv arrays and never through a shell. `--token` is rejected; credentials are inherited from the configured environment variable.

## Current Boundary

This package assumes Potassium will later expose a release-quality command catalog through `pot`, ideally:

```sh
pot catalog --format json
```

Until then, this repo includes a small seeded catalog for discovery and risk routing.

## Security

Please see [SECURITY.md](SECURITY.md) for supported branches, vulnerability reporting, and credential-handling expectations.
