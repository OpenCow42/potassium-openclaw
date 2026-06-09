---
name: potassium
description: Use the prebuilt Potassium CLI command pot for supported service workflows, including Infomaniak services.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# Potassium

Use this skill when the user asks to inspect or manage Infomaniak services such as kDrive, kChat, Mail, or URL shortener.

Use OpenClaw's managed `exec` tool to run the prebuilt `pot` command. This package intentionally does not ship native plugin tools that spawn processes; command execution must stay behind OpenClaw exec policy, allowlists, approvals, sandboxing, and elevated-mode controls.

Command rules:

- Run `pot` as the executable on `PATH`; do not use a checked-in binary or a downloaded path from this package.
- Use one `pot` invocation per `exec` call. Avoid shell chains, pipes, redirections, or inline scripts.
- Prefer `--format json` so results can be summarized safely.
- Discover available commands with `pot --help` or `pot <namespace> --help` when unsure.
- If OpenClaw blocks the command, explain that the operator must install `pot` and allowlist it through exec approvals.

Credential rules:

- Do not ask the user to paste an Infomaniak bearer token into chat.
- Do not pass `--token` to `pot`.
- Rely on `INFOMANIAK_TOKEN` in the OpenClaw execution environment.
- Do not include token values in summaries, logs, filenames, or error messages.

Output rules:

- Request JSON output unless the user explicitly needs human-readable text.
- For file downloads or exports, require an explicit user-approved output path.
- Summarize results in natural language after `exec` returns; do not expose large raw JSON unless the user asks.

Mutation rules:

- Treat create, update, delete, upload, move, copy, trash, restore, send, schedule, alias, forwarding, category, comment, share-link, and Dropbox commands as mutations.
- Perform mutations only when the user explicitly requested the change.
- Confirm destructive or irreversible mutations unless the user already made the exact action clear.
- If mutation execution is blocked, explain that OpenClaw exec policy or the host allowlist must approve the `pot` command.
