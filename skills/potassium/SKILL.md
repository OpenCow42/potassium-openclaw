---
name: potassium
description: Use Potassium's OpenClaw Infomaniak tools backed by the liquid-potassium Node SDK. Trigger for Infomaniak kDrive, kChat, Mail, URL shortener, discovery, and other supported Infomaniak service workflows.
homepage: https://github.com/OpenCow42/potassium-openclaw
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.potassium.enabled"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN"}}
---

# Potassium

Use this skill when the user asks to inspect or manage Infomaniak services such as kDrive, kChat, Mail, URL shortener, Newsletter, Public Cloud, video, VOD, radio, domains, account, profile, AI, kMeet, Swiss Backup, eTickets, or core resources.

The plugin registers native OpenClaw tools through the `liquid-potassium` Node SDK. Do not invoke external binaries or shell commands for Infomaniak API work.

## Tool Workflow

1. Use `infomaniak_domains` when plugin policy or available domains are unclear.
2. Prefer `infomaniak_workflow_list` and `infomaniak_workflow_describe` for reviewed SDK workflow actions.
3. Use `infomaniak_workflow_run` when a reviewed workflow action fits the task.
4. Use `infomaniak_mail_application` for mailbox consumption and mail draft/message actions.
5. Use `infomaniak_search`, `infomaniak_describe`, `infomaniak_discover`, and `infomaniak_call` only when no reviewed workflow action fits.

## Credentials

- Do not ask the user to paste an Infomaniak bearer token into chat.
- Do not include token values in summaries, logs, filenames, tool input echoes, or error messages.
- Rely on `INFOMANIAK_TOKEN` by default, or the configured `tokenEnvName`.
- Use plugin config allowlists and denylists as policy, not as suggestions.

## Mutations

- Treat create, update, delete, upload, move, copy, trash, restore, send, schedule, share, and similar actions as mutations.
- Run mutations only when the user explicitly requested the change and the parameters are clear.
- Set `confirm_mutating=true` only for explicit mutating intent.
- If the plugin blocks mutation, explain that plugin policy prevents the call.

## Results

- Summarize useful identifiers, names, URLs, status, and follow-up choices.
- Do not dump large JSON responses unless the user asks for raw details.
- For file uploads, use absolute local paths in `file_path`.
