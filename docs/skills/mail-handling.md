# Mail Handling

The `mail-handling` skill documents safe Infomaniak Mail workflows through
Potassium's `infomaniak_mail_application` tool. It covers mailbox and folder
resolution, unread mail review, message reads, message moves, and draft actions.

The executable skill instructions live in
[`skills/mail-handling/SKILL.md`](../../skills/mail-handling/SKILL.md).

## Capabilities

- List user mailboxes.
- Resolve mailbox UUIDs from exact addresses.
- List Mail folders.
- List threads or individual messages.
- Read a specific message body.
- Move messages between folders.
- Create, update, delete, schedule, or cancel drafts when mutation is allowed.

## Safety Model

Mail often contains private personal or business information. Agents using this
skill should:

- rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`;
- never ask the user to paste an Infomaniak bearer token;
- avoid printing token values in summaries, tool echoes, scratch files, or
  errors;
- avoid shell commands or external binaries for Mail API work;
- summarize message metadata by default rather than dumping full message bodies.

Treat draft creation, draft updates, draft deletion, scheduling, send
cancellation, and message moves as mutations. Run them only when the user
explicitly requested the action, and set `confirm_mutating=true` when mutation is
allowed.

## Workflow

1. Resolve the mailbox UUID.

   Use a user-provided mailbox UUID when available. If the user names an email
   address or says "my mail", run `listUserMailboxes`. Choose an exact address
   match when possible and ask when multiple mailboxes could match.

2. Resolve folder IDs.

   Run `listFolders` with `mailbox_uuid`. Match folder names exactly before
   using fuzzy matches. Common targets include Inbox, Drafts, Sent, Trash,
   Archive, and Notes.

3. List threads or unread mail.

   Run `listThreads` with `mailbox_uuid` and `folder_id`. For unread mail, set
   `filter` to `unseen`. Set `thread_mode` to `off` when the user wants
   individual messages rather than conversation threads.

4. Read a specific message.

   Use the `message_resource` returned by a thread or message listing. Set
   `preferred_format` to `text` for readable summaries unless the user asks for
   HTML.

5. Move messages only when explicitly requested.

   Run `moveMessages` with the destination and message identifiers accepted by
   the Mail application API. Set `confirm_mutating=true`. Verify with
   `listThreads` in the destination folder when practical.

6. Draft actions only when explicitly requested.

   Use `createDraft`, `updateDraft`, `deleteDraft`, `scheduleDraft`,
   `deleteSchedule`, or `cancelSend`. Set `confirm_mutating=true`.

## Result Summary

For mailbox and folder discovery, summarize exact mailbox addresses, mailbox
UUIDs, folder names, and folder IDs.

For unread or thread listings, summarize sender, subject, date, folder, unread
state, and relevant IDs. Avoid full message bodies unless the user asked to read
the message.

For draft or move actions, summarize what changed and any verification result.

## Troubleshooting

- If no exact mailbox address matches, ask the user to choose a mailbox.
- If a folder target is ambiguous, ask for the folder ID or exact folder name.
- Do not silently move messages to a different folder than requested.
- If plugin policy blocks a mutation, report the policy block and do not try a
  lower-level workaround.
- If the user asks for raw message content, prefer text format first unless HTML
  is required.

## Related Docs

- [Potassium Skill](potassium.md)
- [Architecture](../architecture.md)
- [Liquid Potassium Integration](../liquid-potassium-integration.md)
