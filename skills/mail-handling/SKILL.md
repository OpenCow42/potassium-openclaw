---
name: mail-handling
description: Use Infomaniak Mail through the prebuilt Potassium CLI command pot and OpenClaw managed exec. Use when an agent needs to list mailboxes or folders, read threads or messages, create drafts, move messages between folders, handle unread mail, or work with Mail while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# Mail Handling

Use this skill to inspect or modify Infomaniak Mail with Potassium's `pot` command through OpenClaw managed `exec`.

## Safety

- Use OpenClaw's built-in `exec` tool to run `pot`; do not expect native plugin tools or service-prefixed OpenClaw tools.
- Use one `pot` invocation per `exec` call. Avoid shell chains, pipes, redirections, or inline scripts.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` in the OpenClaw execution environment.
- Do not print token values in summaries, command output, scratch files, or error messages.
- Treat draft creation/update/delete/scheduling, send cancellation, and message moves as mutations.
- Modify Mail only when the user explicitly requested it and OpenClaw exec approvals allow the command.
- Do not expose full message bodies unless the user asked to read them; summarize sender, subject, date, folder, unread state, and relevant ids by default.
- Do not invent raw HTTP calls or Mail operations not exposed by `pot`; check `pot mail --help` first.

## OpenClaw Exec Workflow

1. Resolve the mailbox UUID.
   - Use a user-provided mailbox UUID when available.
   - If the user names an email address or just says "my mail", run `pot mail user-mailboxes --format json`.
   - Choose an exact address match when possible; ask when multiple mailboxes could match.

2. Resolve folder ids.
   - Run `pot mail folders --mailbox-uuid "$MAILBOX_UUID" --format json`.
   - Match folder names exactly before using fuzzy matches. Common targets include Inbox, Drafts, Sent, Trash, Archive, and Notes.
   - Do not silently move mail to a different folder than requested.

3. List threads or unread mail.
   - Run `pot mail threads` with `--mailbox-uuid` plus `--folder-id`.
   - For unread mail, add `filter: "unseen"` when supported by the installed `pot`.
   - Use `thread: "off"` if the user wants individual messages rather than conversation threads.

4. Read a specific message.
   - Use the `resource` returned by a thread or message listing.
   - Prefer `preferred-format: "text"` for readable summaries; use HTML only when requested.

```sh
pot mail message \
  --resource "$MESSAGE_RESOURCE" \
  --preferred-format text \
  --format json
```

5. Move messages between folders.
   - First confirm the installed `pot` exposes `mail move`; if it does not, explain that the local Potassium binary needs a version with Mail move support.
   - The `uid` value must be folder-qualified: `MESSAGE_UID@SOURCE_FOLDER_ID`.
   - Repeat `uid` for multiple messages.
   - Verify with `threads` in the destination folder when practical.

```sh
pot mail move \
  --mailbox-uuid "$MAILBOX_UUID" \
  --uid "$MESSAGE_UID@$SOURCE_FOLDER_ID" \
  --to-folder-id "$DESTINATION_FOLDER_ID" \
  --format json
```

6. Create a draft only when explicitly requested.

```sh
pot mail draft-create \
  --mailbox-uuid "$MAILBOX_UUID" \
  --to "$RECIPIENT_EMAIL" \
  --subject "$SUBJECT" \
  --body "$HTML_BODY" \
  --format json
```

## Common pot Commands

- `mail user-mailboxes`: list available Mail mailboxes.
- `mail folders`: list folders for a mailbox UUID.
- `mail threads`: list threads or messages in a folder.
- `mail message`: read one message resource.
- `mail draft-create`, `draft-update`, `draft-delete`, `draft-schedule`, `schedule-delete`, and `cancel-send`: use only when explicitly requested.
- `mail move`: move folder-qualified message UIDs to another folder.

Check the binary and Mail commands:

```sh
command -v pot
pot mail --help
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
