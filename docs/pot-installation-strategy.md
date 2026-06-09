# Pot Installation Strategy

## Decision

Keep `pot` as an external runtime dependency installed by the host platform package manager. The OpenClaw skills require `pot` on the `PATH` visible to OpenClaw.

OpenClaw should not vendor, compile, auto-install, or spawn the Potassium binary from native plugin code inside this package. Agents should run `pot` through OpenClaw's managed `exec` tool.

## OpenClaw Packaging Standard

OpenClaw's plugin distribution model separates the plugin package from host tools. The bundled skills follow the documented [`SKILL.md` metadata shape](https://docs.openclaw.ai/tools/skills):

- Publish the OpenClaw integration as a Codex-compatible bundle through ClawHub, with git or archive installs as supported fallbacks.
- Ship `.codex-plugin/plugin.json` at the package root with the bundled `skills` root.
- Do not ship `openclaw.plugin.json` and do not declare `package.json` `openclaw.extensions`; those make OpenClaw treat the package as a native plugin that requires a runtime entrypoint.
- Ship skill directories through the bundle so OpenClaw can load the operating guides without importing runtime code.
- Declare required host binaries in one-line `SKILL.md` JSON metadata with `metadata.openclaw.requires.bins`.
- Declare the token environment variable with `metadata.openclaw.requires.env` and `metadata.openclaw.primaryEnv`.
- Provide OpenClaw installer hints in `metadata.openclaw.install` only when a documented installer kind exists.
- Keep native binary lifecycle outside plugin code. OpenClaw installs plugin npm dependencies with lifecycle scripts disabled, so `postinstall` downloads or builds are not an appropriate distribution path for `pot`.

For this repository, that means the plugin package can make `pot` easy to discover and use, but it should not contain the `pot` executable or any process-spawning runner.

## Release Sources

- Homebrew tap: [OpenCow42/homebrew-tap](https://github.com/OpenCow42/homebrew-tap)
- APT repository: [OpenCow42/apt-repo](https://github.com/OpenCow42/apt-repo)
- Binary releases: [OpenCow42/tool-releases](https://github.com/OpenCow42/tool-releases)

## Rationale

- Homebrew and APT are the right owners for native binary lifecycle: architecture selection, checksums, upgrades, uninstall behavior, and host policy.
- OpenClaw managed `exec` is the right owner for command execution, host allowlisting, approvals, sandboxing, and elevated access.
- The OpenClaw skills are the right owner for workflow guidance, credential handling rules, mutation caution, and command examples.
- Keeping the binary external avoids duplicating release artifacts in the plugin package and avoids tying plugin updates to every native Potassium build.
- Pinned builds should be exposed as `pot` on `PATH`, or allowlisted by their resolved absolute path in OpenClaw exec approvals.

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

Then allow `pot` through OpenClaw managed exec. A strict local setup is:

```sh
openclaw exec-policy set --security allowlist --ask on-miss --ask-fallback deny
openclaw approvals allowlist add "pot"
```

Use `openclaw approvals allowlist add "/absolute/path/to/pot"` when the operator wants to trust one resolved binary path instead of any `pot` found on `PATH`.

Finally install the OpenClaw skills bundle:

```sh
openclaw plugins install --link .
```

## OpenClaw Responsibilities

- Declare `pot` as a required binary in bundled skill metadata.
- Declare `INFOMANIAK_TOKEN` through `metadata.openclaw.requires.env` and `primaryEnv`.
- Declare a Homebrew installer hint for `opencow42/tap/potassium` in bundled skill metadata.
- Provide clear install docs for `pot`, `INFOMANIAK_TOKEN`, and OpenClaw exec allowlisting.
- Never instruct agents to pass credentials as CLI arguments; use `INFOMANIAK_TOKEN`.
- Keep mutation guidance explicit and conservative in skills.
- Document Homebrew/APT install commands as setup hints, not as runtime behavior.

## Sandboxed Agents

OpenClaw checks `metadata.openclaw.requires.bins` on the host when it loads skills. If the agent itself runs inside a container sandbox, `pot` must also exist inside that container. Use an image that already contains Potassium, or install it through the sandbox setup command.

## Do Not

- Do not add `pot` as a checked-in binary in this repository.
- Do not compile Swift from this plugin.
- Do not import Node process-spawning APIs or register native tools that spawn `pot`.
- Do not make the plugin run `brew` or `apt` automatically.
- Do not add undocumented installer metadata such as `kind: "apt"` to `SKILL.md`.
- Do not duplicate public release artifact metadata inside the plugin beyond minimum install guidance.
