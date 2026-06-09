---
name: mail-handling
description: Use Infomaniak Mail through the prebuilt Potassium CLI command pot and the OpenClaw infomaniak plugin. Use when an agent needs to list mailboxes or folders, read threads or messages, create drafts, move messages between folders, handle unread mail, or work with Mail while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# Mail Handling

Use this skill to inspect or modify Infomaniak Mail with Potassium's `pot` command through OpenClaw.

## Safety

- Prefer the OpenClaw `infomaniak_*` tools over direct shell commands.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not print token values in summaries, command output, scratch files, or error messages.
- Treat draft creation/update/delete/scheduling, send cancellation, and message moves as mutations.
- If `infomaniak_mutate` is unavailable or `mutationMode` is not `allow`, explain that the operator must enable mutation support before modifying Mail.
- Do not expose full message bodies unless the user asked to read them; summarize sender, subject, date, folder, unread state, and relevant ids by default.
- Do not invent raw HTTP calls or Mail operations not exposed by `pot`; search the command catalog or check `pot --help` first.

## OpenClaw Workflow

1. Resolve the mailbox UUID.
   - Use a user-provided mailbox UUID when available.
   - If the user names an email address or just says "my mail", use `infomaniak_read` with `namespace: "mail"` and `command: "user-mailboxes"`.
   - Choose an exact address match when possible; ask when multiple mailboxes could match.

2. Resolve folder ids.
   - Use `infomaniak_read` with `command: "folders"` and option `mailbox-uuid`.
   - Match folder names exactly before using fuzzy matches. Common targets include Inbox, Drafts, Sent, Trash, Archive, and Notes.
   - Do not silently move mail to a different folder than requested.

3. List threads or unread mail.
   - Use `infomaniak_read` with `command: "threads"` and options `mailbox-uuid` plus `folder-id`.
   - For unread mail, add `filter: "unseen"` when supported by the installed `pot`.
   - Use `thread: "off"` if the user wants individual messages rather than conversation threads.

4. Read a specific message.
   - Use the `resource` returned by a thread or message listing.
   - Prefer `preferred-format: "text"` for readable summaries; use HTML only when requested.

```json
{
  "namespace": "mail",
  "command": "message",
  "options": [
    { "name": "resource", "value": "MESSAGE_RESOURCE" },
    { "name": "preferred-format", "value": "text" }
  ],
  "format": "json"
}
```

5. Move messages between folders.
   - First confirm the installed `pot` exposes `mail move`; if it does not, explain that the local Potassium binary needs a version with Mail move support.
   - Use `infomaniak_mutate` with `command: "move"`.
   - The `uid` value must be folder-qualified: `MESSAGE_UID@SOURCE_FOLDER_ID`.
   - Repeat `uid` for multiple messages.
   - Verify with `threads` in the destination folder when practical.

```json
{
  "namespace": "mail",
  "command": "move",
  "options": [
    { "name": "mailbox-uuid", "value": "MAILBOX_UUID" },
    { "name": "uid", "value": ["UID_1@SOURCE_FOLDER_ID", "UID_2@SOURCE_FOLDER_ID"] },
    { "name": "to-folder-id", "value": "DESTINATION_FOLDER_ID" }
  ],
  "format": "json"
}
```

6. Create a draft only when explicitly requested.

```json
{
  "namespace": "mail",
  "command": "draft-create",
  "options": [
    { "name": "mailbox-uuid", "value": "MAILBOX_UUID" },
    { "name": "to", "value": "RECIPIENT_EMAIL" },
    { "name": "subject", "value": "SUBJECT" },
    { "name": "body", "value": "HTML_BODY" }
  ],
  "format": "json"
}
```

## Common pot Commands

- `mail user-mailboxes`: list available Mail mailboxes.
- `mail folders`: list folders for a mailbox UUID.
- `mail threads`: list threads or messages in a folder.
- `mail message`: read one message resource.
- `mail draft-create`, `draft-update`, `draft-delete`, `draft-schedule`, `schedule-delete`, and `cancel-send`: use only when explicitly requested.
- `mail move`: move folder-qualified message UIDs to another folder.

## Plain macOS/Linux Shell Fallback

Use this only outside OpenClaw tools, or when debugging locally. Keep examples compatible with a standard macOS or Linux shell. Do not require Rust CLI tools such as `rg` or `fd`; do not require `jq`.

Check the binary and Mail commands:

```sh
command -v pot
pot --help | grep 'mail user-mailboxes'
pot --help | grep 'mail move'
```

List mailboxes and folders:

```sh
pot mail user-mailboxes --with unseen,aliases --format json
pot mail folders --mailbox-uuid "$MAILBOX_UUID" --format json
```

List unread threads in a folder:

```sh
pot mail threads \
  --mailbox-uuid "$MAILBOX_UUID" \
  --folder-id "$FOLDER_ID" \
  --filter unseen \
  --format json
```

Read one message:

```sh
pot mail message \
  --resource "$MESSAGE_RESOURCE" \
  --preferred-format text \
  --format json
```

Move one message when you know the source and destination folder ids:

```sh
pot mail move \
  --mailbox-uuid "$MAILBOX_UUID" \
  --uid "$MESSAGE_UID@$SOURCE_FOLDER_ID" \
  --to-folder-id "$DESTINATION_FOLDER_ID" \
  --format json
```
