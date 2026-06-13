---
name: kdrive-writing
description: Write files and folders to Infomaniak kDrive through Potassium's native OpenClaw tools backed by the liquid-potassium Node SDK. Use when an agent needs to create kDrive directories, upload local files, choose or verify writable parent folders, handle the non-writable root folder, or perform other kDrive mutations while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/potassium-openclaw
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.potassium.enabled"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN"}}
---

# kDrive Writing

Use this skill to create or modify kDrive content through `infomaniak_workflow_*` tools.

## Safety

- Do not invoke external binaries or shell commands for kDrive API work.
- Never ask the user to paste an Infomaniak bearer token.
- Rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Treat create, upload, rename, copy, move, trash, restore, favorite, category, comment, share-link, Dropbox, and settings actions as mutations.
- Write only when the user explicitly requested it.
- Confirm destructive or irreversible actions unless the user explicitly requested the exact action.
- Never target kDrive root for create or upload operations. Root is a listing/navigation anchor, not a writable folder.
- Do not silently write to a different parent folder than requested.

## Workflow

1. Resolve the drive id.
   - Use a user-provided drive id when available.
   - If only a default drive is implied, run `infomaniak_workflow_run` with domain `kdrive`, action `getUserPreferences`.
   - If no drive id can be found, ask for it.

2. Resolve the parent directory.
   - Use a user-provided directory id when available.
   - Treat root, commonly file id `1`, as read-only.
   - If the user asks for the default writable location, run action `findPrivateFolder`.
   - Use action `listDirectory` to inspect known directories.
   - If `Private` is missing or ambiguous, ask for the target directory id.

3. Create a directory only when explicitly requested.
   - Use `infomaniak_workflow_run` with domain `kdrive`, action `createDirectory`.
   - Required input: `drive_id`, `file_id`, and body object such as `{ "name": "Folder name" }`.
   - Set `confirm_mutating=true`.

4. Create a supported document file only when explicitly requested.
   - Use action `createDefaultFile`.
   - Required input: `drive_id`, `file_id`, and body object accepted by the API.
   - Set `confirm_mutating=true`.

5. Upload a local file only when explicitly requested.
   - Use action `uploadFile`.
   - Required input: `drive_id` and absolute `file_path`.
   - Provide `directory_id` or `directory_path`, plus `file_name` and `conflict` when the user requested them.
   - Set `confirm_mutating=true`.

6. Verify results when practical.
   - Use action `getFile` for returned file or directory ids.
   - Use action `listDirectory` to confirm a directory contains the expected upload.
   - Summarize the drive id, parent id, created directory id, uploaded file id, and any non-default conflict behavior.
