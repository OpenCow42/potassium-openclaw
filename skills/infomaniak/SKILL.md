---
name: infomaniak
description: Interact with Infomaniak services through the prebuilt Potassium CLI command pot.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# Infomaniak

Use this skill when the user asks to inspect or manage Infomaniak services such as kDrive, kChat, Mail, or URL shortener.

Prefer the OpenClaw tools supplied by the `infomaniak` plugin:

1. Use `infomaniak_search_commands` to find the closest Potassium command.
2. Use `infomaniak_read` for read-only requests.
3. Use `infomaniak_mutate` only for explicit user-requested changes when the operator has enabled mutation support.

Credential rules:

- Do not ask the user to paste an Infomaniak bearer token into chat.
- Do not pass `--token` in tool options.
- Rely on `INFOMANIAK_TOKEN` or the configured token environment variable.
- Do not include token values in summaries, logs, filenames, or error messages.

Output rules:

- Request JSON output unless the user explicitly needs human-readable text.
- For file downloads or exports, require an explicit output path under the configured output root.
- Summarize results in natural language after the tool returns; do not expose large raw JSON unless the user asks.

Mutation rules:

- Treat create, update, delete, upload, move, copy, trash, restore, send, schedule, alias, forwarding, category, comment, share-link, and Dropbox commands as mutations.
- If mutation tooling is disabled, explain that the operator must enable `infomaniak_mutate` and set `mutationMode` to `allow`.
