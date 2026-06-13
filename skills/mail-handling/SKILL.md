---
name: mail-handling
description: Use Infomaniak Mail through Potassium's native OpenClaw tools backed by the liquid-potassium Node SDK. Use when an agent needs to list mailboxes or folders, read threads or messages, create drafts, move messages between folders, handle unread mail, or work with Mail while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/potassium-openclaw
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.potassium.enabled"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN"}}
---

# Mail Handling

Use this skill to inspect or modify Infomaniak Mail through `infomaniak_mail_application`.

## Safety

- Do not invoke external binaries or shell commands for Mail API work.
- Never ask the user to paste an Infomaniak bearer token.
- Rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not print token values in summaries, tool input echoes, scratch files, or error messages.
- Treat draft creation/update/delete/scheduling, send cancellation, and message moves as mutations.
- Modify Mail only when the user explicitly requested it.
- Do not expose full message bodies unless the user asked to read them; summarize sender, subject, date, folder, unread state, and relevant ids by default.

## Workflow

1. Resolve the mailbox UUID.
   - Use a user-provided mailbox UUID when available.
   - If the user names an email address or says "my mail", run action `listUserMailboxes`.
   - Choose an exact address match when possible; ask when multiple mailboxes could match.

2. Resolve folder ids.
   - Run action `listFolders` with `mailbox_uuid`.
   - Match folder names exactly before using fuzzy matches. Common targets include Inbox, Drafts, Sent, Trash, Archive, and Notes.
   - Do not silently move mail to a different folder than requested.

3. List threads or unread mail.
   - Run action `listThreads` with `mailbox_uuid` and `folder_id`.
   - For unread mail, set `filter` to `unseen`.
   - Set `thread_mode` to `off` when the user wants individual messages rather than conversation threads.

4. Read a specific message.
   - Use the `message_resource` returned by a thread or message listing.
   - Set `preferred_format` to `text` for readable summaries unless the user asked for HTML.

5. Move messages between folders only when explicitly requested.
   - Run action `moveMessages`.
   - The payload should include destination and message identifiers accepted by the Mail application API.
   - Set `confirm_mutating=true`.
   - Verify with `listThreads` in the destination folder when practical.

6. Create or update drafts only when explicitly requested.
   - Use actions `createDraft`, `updateDraft`, `deleteDraft`, `scheduleDraft`, `deleteSchedule`, or `cancelSend`.
   - Set `confirm_mutating=true`.
