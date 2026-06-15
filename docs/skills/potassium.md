# Potassium Skill

The `potassium` skill is the general Infomaniak entry point for OpenClaw agents.
It explains when to use Potassium's native OpenClaw tools, how to choose between
reviewed workflows and lower-level discovery tools, and how to keep credentials
and mutations under control.

Use this document for package-level behavior. The executable skill instructions
live in [`skills/potassium/SKILL.md`](../../skills/potassium/SKILL.md).

## When To Use

Use the Potassium skill for Infomaniak services such as kDrive, kChat, Mail, URL
shortener, Newsletter, Public Cloud, video, VOD, radio, domains, account,
profile, AI, kMeet, Swiss Backup, eTickets, and core resources.

The skill is a safe default when the user asks for an Infomaniak task and the
more specific kDrive, Mail, kChat, or URL shortener skill does not fully cover
the request.

## Tool Selection

Potassium exposes these OpenClaw tools:

- `infomaniak_domains`
- `infomaniak_search`
- `infomaniak_describe`
- `infomaniak_discover`
- `infomaniak_mail_application`
- `infomaniak_workflow_list`
- `infomaniak_workflow_describe`
- `infomaniak_workflow_run`
- `infomaniak_call`

Recommended order:

1. Use `infomaniak_domains` when plugin policy or available domains are unclear.
2. Use `infomaniak_workflow_list` and `infomaniak_workflow_describe` to find a
   reviewed SDK workflow.
3. Use `infomaniak_workflow_run` when a reviewed workflow fits the task.
4. Use `infomaniak_mail_application` for mailbox consumption and Mail draft or
   message actions.
5. Use `infomaniak_search`, `infomaniak_describe`, `infomaniak_discover`, and
   `infomaniak_call` only when no reviewed workflow fits.

## Safety Model

Potassium reads credentials from `INFOMANIAK_TOKEN` by default, or from the
configured `tokenEnvName`. Direct bearer-token config is intentionally rejected
by the adapter.

Agents using this skill should:

- never ask the user to paste an Infomaniak bearer token into chat;
- never include token values in summaries, logs, filenames, tool inputs, or
  error messages;
- treat plugin allowlists and denylists as policy;
- avoid shell commands or external binaries for Infomaniak API work.

## Mutations

Create, update, delete, upload, move, copy, trash, restore, send, schedule,
share, and similar actions are mutations.

Mutation rules:

- `blockMutating` defaults to `true` at the plugin level.
- Mutating calls require clear user intent.
- When mutation is allowed and explicit, the tool call must set
  `confirm_mutating=true`.
- If plugin policy blocks the call, report that policy blocked it rather than
  looking for an unreviewed workaround.

## Results

Good responses summarize the useful operational facts: identifiers, names, URLs,
status, timestamps, and follow-up choices. Large raw JSON payloads should stay
out of normal answers unless the user explicitly asks for raw details.

For file uploads, use absolute local paths in `file_path`.

## Configuration

Core plugin config:

- `tokenEnvName`: environment variable name for the Infomaniak bearer token.
- `baseUrl`: optional Infomaniak API base URL override.
- `mailApplicationBaseUrl`: optional Mail application API base URL override.
- `allowedDomains`: optional domain allowlist.
- `allowedOperations`: optional operation allowlist.
- `deniedOperations`: optional operation denylist.
- `blockMutating`: blocks mutation when `true`.

Keep `blockMutating: true` unless the install deliberately allows write-capable
tools.

## Related Docs

- [kDrive Writing](kdrive-writing.md)
- [Mail Handling](mail-handling.md)
- [kChat Posting](kchat-posting.md)
- [kChat Channel](../kchat-channel.md)
- [URL Shortener](url-shortener.md)
