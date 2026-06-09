# Pot Installation Strategy

## Decision

Keep `pot` as an external runtime dependency installed by the host platform package manager. The OpenClaw plugin should discover `pot` on `PATH`, or use an explicit `potPath` when an operator wants to pin a specific binary.

OpenClaw should not vendor, compile, or auto-install the Potassium binary inside this plugin.

## OpenClaw Packaging Standard

OpenClaw's plugin distribution model separates the plugin package from host tools. The bundled skills follow the documented [`SKILL.md` metadata shape](https://docs.openclaw.ai/tools/skills):

- Publish the OpenClaw integration as a native plugin package through ClawHub, with npm as a supported fallback.
- Ship `openclaw.plugin.json` at the package root and keep `package.json` `openclaw.extensions` aligned with the runtime entrypoint.
- Ship skill directories through `openclaw.plugin.json` `skills` so OpenClaw can load the operating guides with the plugin.
- Declare required host binaries in one-line `SKILL.md` JSON metadata with `metadata.openclaw.requires.bins`.
- Declare the token environment variable with `metadata.openclaw.requires.env` and `metadata.openclaw.primaryEnv`.
- Provide OpenClaw installer hints in `metadata.openclaw.install` only when a documented installer kind exists.
- Keep native binary lifecycle outside plugin runtime code. OpenClaw installs plugin npm dependencies with lifecycle scripts disabled, so `postinstall` downloads or builds are not an appropriate distribution path for `pot`.

For this repository, that means the plugin package can make `pot` easy to discover and install, but it should not contain the `pot` executable.

## Release Sources

- Homebrew tap: [OpenCow42/homebrew-tap](https://github.com/OpenCow42/homebrew-tap)
- APT repository: [OpenCow42/apt-repo](https://github.com/OpenCow42/apt-repo)
- Binary releases: [OpenCow42/tool-releases](https://github.com/OpenCow42/tool-releases)

## Rationale

- Homebrew and APT are the right owners for native binary lifecycle: architecture selection, checksums, upgrades, uninstall behavior, and host policy.
- The OpenClaw plugin is the right owner for tool contracts, parameter validation, token injection, mutation gating, output containment, and error redaction.
- Keeping the binary external avoids duplicating release artifacts in the plugin package and avoids tying plugin updates to every native Potassium build.
- `potPath` preserves escape hatches for pinned builds, air-gapped installs, and test fixtures without changing the default model.

## Operator Flow

Install Potassium with the platform package manager:

### Homebrew

```sh
brew install opencow42/tap/potassium
```

Or add the Homebrew tap explicitly:

```sh
brew tap opencow42/tap
brew install potassium
pot version
```

### APT

On Debian-family systems, install Potassium after enabling the OpenCow APT repository:

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

The bundled skills declare a Homebrew installer hint for `pot`, so OpenClaw UIs that support skill installer metadata can offer the Homebrew path. APT remains documented setup guidance because OpenClaw's documented skill installer kinds currently cover Homebrew, Node, Go, uv, and direct downloads, not APT. Direct download installer metadata is intentionally omitted until the release artifacts can be represented without losing architecture and checksum clarity.

Then enable the OpenClaw plugin with `pot` available on `PATH`. If `pot` is installed somewhere else, configure:

```json5
{ plugins: { entries: { infomaniak: { config: { potPath: "/absolute/path/to/pot" } } } } }
```

## OpenClaw Responsibilities

- Declare `pot` as a required binary in bundled skill metadata.
- Declare `INFOMANIAK_TOKEN` through `metadata.openclaw.requires.env` and `primaryEnv`.
- Declare a Homebrew installer hint for `opencow42/tap/potassium` in bundled skill metadata.
- Provide a doctor check that fails clearly when `pot` is missing or too old.
- Never pass credentials as CLI arguments; use the configured token environment variable.
- Keep mutation tools optional and default-denied.
- Document Homebrew/APT install commands as setup hints, not as runtime behavior.

## Sandboxed Agents

OpenClaw checks `metadata.openclaw.requires.bins` on the host when it loads skills. If the agent itself runs inside a container sandbox, `pot` must also exist inside that container. Use an image that already contains Potassium, or install it through the sandbox setup command.

## Do Not

- Do not add `pot` as a checked-in binary in this repository.
- Do not compile Swift from this plugin.
- Do not make the plugin run `brew` or `apt` automatically.
- Do not add undocumented installer metadata such as `kind: "apt"` to `SKILL.md`.
- Do not duplicate public release artifact metadata inside the plugin beyond minimum install guidance.
