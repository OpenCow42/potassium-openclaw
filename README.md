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

Potassium release and Homebrew distribution are handled outside this repository.

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
