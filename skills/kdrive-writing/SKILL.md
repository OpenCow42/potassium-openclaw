---
name: kdrive-writing
description: Write files and folders to Infomaniak kDrive through the prebuilt Potassium CLI command pot and OpenClaw managed exec. Use when an agent needs to create kDrive directories, upload local files, choose or verify writable parent folders, handle the non-writable root folder, or perform other kDrive mutations exposed by pot while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# kDrive Writing

Use this skill to create or modify kDrive content with Potassium's `pot` command through OpenClaw managed `exec`.

## Safety

- Use OpenClaw's built-in `exec` tool to run `pot`; do not expect native plugin tools or service-prefixed OpenClaw tools.
- Use one `pot` invocation per `exec` call. Avoid shell chains, pipes, redirections, or inline scripts.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` in the OpenClaw execution environment.
- Do not print token values in summaries, command output, filenames, or error messages.
- Treat create, upload, rename, copy, move, trash, restore, favorite, category, comment, share-link, Dropbox, and settings commands as mutations.
- Write only when the user explicitly requested it and OpenClaw exec approvals allow the command.
- Confirm destructive or irreversible actions such as permanent delete, bulk category removal, or settings changes unless the user explicitly requested them.
- Never target kDrive root for create or upload operations. Root is a listing/navigation anchor, not a writable folder.
- Do not silently write to a different parent folder than requested.

## OpenClaw Exec Workflow

1. Resolve the drive id.
   - Use the drive id from the user when provided.
   - If only a default drive is implied, run `pot kdrive preferences --format json` and read `defaultDrive` from the JSON response when available.
   - If no drive id can be found, ask for it.

2. Resolve the parent directory.
   - Use a user-provided directory id when available.
   - Treat kDrive root, commonly `file-id: 1`, as not writable across drives. Use it only to inspect top-level children.
   - The top-level folder named `Private` is the expected writable location across drives. Resolve it from the root listing and use its returned id rather than hard-coding a folder id.
   - If the user asks to write to root, explain that kDrive root is not writable and ask whether to use `Private`.
   - If the user asks for the default writable location or does not name a parent folder, resolve and use the top-level `Private` folder.
   - If `Private` is missing or the root listing is ambiguous, stop and ask for the target directory id.
   - To inspect a directory, run `pot kdrive directory-files --drive-id "$DRIVE_ID" --file-id "$FILE_ID" --format json`.

3. Create a directory:

```sh
pot kdrive create-directory \
  --drive-id "$DRIVE_ID" \
  --file-id "$PARENT_DIRECTORY_ID" \
  --name "$DIRECTORY_NAME" \
  --format json
```

4. Upload a local file:

```sh
pot kdrive upload-file \
  --drive-id "$DRIVE_ID" \
  --file "/absolute/local/file.txt" \
  --directory-id "$TARGET_DIRECTORY_ID" \
  --file-name "$REMOTE_FILE_NAME" \
  --conflict error \
  --format json
```

5. Verify results when practical.
   - Use `kdrive file` to verify returned file or directory ids.
   - Use `kdrive directory-files` to confirm a directory contains the expected upload.
   - Summarize the drive id, parent id, created directory id, uploaded file id, and any non-default conflict behavior.

## Common pot Commands

- `kdrive preferences`: read the account's default drive.
- `kdrive drive`: verify a drive id.
- `kdrive file`: verify one file or directory id.
- `kdrive directory-files`: list child files for a directory id.
- `kdrive create-directory`: create a child directory.
- `kdrive upload-file`: upload a local file by `--directory-id` or `--directory-path`.
- `kdrive rename-file`, `copy-file`, `move-file`, `trash-file`, and `restore-trashed-file`: use only when explicitly requested.

Check the binary and command help:

```sh
command -v pot
pot kdrive --help
```
