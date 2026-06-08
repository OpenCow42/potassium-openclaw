# Pot Installation Strategy

## Decision

Keep `pot` as an external runtime dependency installed by the host platform package manager. The OpenClaw plugin should discover `pot` on `PATH`, or use an explicit `potPath` when an operator wants to pin a specific binary.

OpenClaw should not vendor, compile, or auto-install the Potassium binary inside this plugin.

## Rationale

- Homebrew and APT are the right owners for native binary lifecycle: architecture selection, checksums, upgrades, uninstall behavior, and host policy.
- The OpenClaw plugin is the right owner for tool contracts, parameter validation, token injection, mutation gating, output containment, and error redaction.
- Keeping the binary external avoids duplicating release artifacts in the plugin package and avoids tying plugin updates to every native Potassium build.
- `potPath` preserves escape hatches for pinned builds, air-gapped installs, and test fixtures without changing the default model.

## Operator Flow

Install Potassium with the platform package manager:

```sh
brew install opencow42/tap/potassium
```

Or, on Debian-family systems after enabling the OpenCow APT repository:

```sh
sudo apt install potassium
```

Then enable the OpenClaw plugin with `pot` available on `PATH`. If `pot` is installed somewhere else, configure:

```json5
{ plugins: { entries: { infomaniak: { config: { potPath: "/absolute/path/to/pot" } } } } }
```

## OpenClaw Responsibilities

- Declare `pot` as a required binary in bundled skill metadata.
- Provide a doctor check that fails clearly when `pot` is missing or too old.
- Never pass credentials as CLI arguments; use the configured token environment variable.
- Keep mutation tools optional and default-denied.
- Document Homebrew/APT install commands as setup hints, not as runtime behavior.

## Do Not

- Do not add `pot` as a checked-in binary in this repository.
- Do not compile Swift from this plugin.
- Do not make the plugin run `brew` or `apt` automatically.
- Do not duplicate public release artifact metadata inside the plugin beyond minimum version/install guidance.
