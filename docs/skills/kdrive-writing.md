# kDrive Writing

The `kdrive-writing` skill documents safe write workflows for Infomaniak kDrive
through Potassium's native OpenClaw tools. It focuses on creating folders,
creating default files, uploading local files, and verifying the result without
writing to unexpected locations.

The executable skill instructions live in
[`skills/kdrive-writing/SKILL.md`](../../skills/kdrive-writing/SKILL.md).

## Capabilities

- Resolve a user's kDrive ID.
- Find a writable parent folder.
- Create directories.
- Create supported default document files.
- Upload local files by absolute path.
- Verify created or uploaded content.

## Safety Model

kDrive writes can modify or expose user data. Agents using this skill should:

- rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`;
- never ask the user to paste an Infomaniak bearer token;
- treat create, upload, rename, copy, move, trash, restore, favorite, category,
  comment, share-link, Dropbox, and settings actions as mutations;
- write only when the user explicitly requested the change;
- confirm destructive or irreversible actions unless the user already requested
  the exact action;
- avoid shell commands or external binaries for kDrive API work.

The kDrive root, commonly file ID `1`, is a listing and navigation anchor. Do
not target it for create or upload operations.

## Workflow

1. Resolve the drive ID.

   Use a user-provided drive ID when available. If only the default drive is
   implied, run `infomaniak_workflow_run` with domain `kdrive` and action
   `getUserPreferences`. Ask for the drive ID when it cannot be resolved.

2. Resolve the parent directory.

   Use a user-provided directory ID when available. If the user asks for the
   default writable location, run action `findPrivateFolder`. Use
   `listDirectory` to inspect known directories.

3. Create directories only when explicitly requested.

   Run domain `kdrive`, action `createDirectory`, with `drive_id`, `file_id`,
   and a body such as `{ "name": "Folder name" }`. Set
   `confirm_mutating=true`.

4. Create default document files only when explicitly requested.

   Run action `createDefaultFile` with `drive_id`, `file_id`, and the body
   accepted by the API. Set `confirm_mutating=true`.

5. Upload local files only when explicitly requested.

   Run action `uploadFile` with `drive_id` and an absolute `file_path`. Provide
   `directory_id` or `directory_path`, plus `file_name` and `conflict` when the
   user requested them. Set `confirm_mutating=true`.

6. Verify when practical.

   Use `getFile` for returned file or directory IDs, or `listDirectory` to
   confirm that the target directory contains the expected upload.

## Inputs To Prefer

Prefer stable IDs when the user provides them:

- `drive_id`
- parent `file_id` or `directory_id`
- absolute local `file_path`
- explicit `file_name`
- explicit conflict behavior

Do not silently choose a different parent folder than the one requested. Ask
when the destination is ambiguous.

## Result Summary

For successful writes, summarize:

- drive ID;
- parent folder ID;
- created directory ID;
- uploaded file ID;
- conflict behavior when non-default;
- any follow-up verification result.

## Troubleshooting

- If the root folder is selected for a write, choose a writable folder only when
  the user explicitly asked for that fallback; otherwise ask for a target.
- If the private folder is missing or ambiguous, ask for the directory ID.
- If mutation is blocked by plugin policy, report the policy block and stop.
- If upload verification cannot find the file, report the created/upload action
  result separately from the verification failure.

## Related Docs

- [Potassium Skill](potassium.md)
- [Architecture](../architecture.md)
- [Liquid Potassium Integration](../liquid-potassium-integration.md)
