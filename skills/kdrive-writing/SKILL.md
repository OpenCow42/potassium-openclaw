---
name: kdrive-writing
description: Write files and folders to Infomaniak kDrive through the prebuilt Potassium CLI command pot and the OpenClaw infomaniak plugin. Use when an agent needs to create kDrive directories, upload local files, choose or verify parent folders, handle root write permission failures, or perform other kDrive mutations exposed by pot while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# kDrive Writing

Use this skill to create or modify kDrive content with Potassium's `pot` command through OpenClaw.

## Safety

- Prefer the OpenClaw `infomaniak_*` tools over direct shell commands.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not print token values in summaries, command output, filenames, or error messages.
- Treat create, upload, rename, copy, move, trash, restore, favorite, category, comment, share-link, Dropbox, and settings commands as mutations.
- If `infomaniak_mutate` is unavailable or `mutationMode` is not `allow`, explain that the operator must enable mutation support before writing to kDrive.
- Confirm destructive or irreversible actions such as permanent delete, bulk category removal, or settings changes unless the user explicitly requested them.
- Do not silently write to a different parent folder than requested.

## OpenClaw Workflow

1. Resolve the drive id.
   - Use the drive id from the user when provided.
   - If only a default drive is implied, use `infomaniak_read` with `namespace: "kdrive"`, `command: "preferences"` and read `defaultDrive` from the JSON response when available.
   - If no drive id can be found, ask for it.

2. Resolve the parent directory.
   - Use a user-provided directory id when available.
   - kDrive root is commonly `file-id: 1`, but root writes can return `permission_denied`.
   - If the user asks for root, try `file-id: 1` only for that explicit request.
   - If root write fails, stop and ask before using a top-level child folder such as `Private`; do not auto-fallback.
   - To inspect a directory, use `infomaniak_read` with `command: "directory-files"` and options `drive-id` and `file-id`.

3. Create a directory with `infomaniak_mutate`:

```json
{
  "namespace": "kdrive",
  "command": "create-directory",
  "options": [
    { "name": "drive-id", "value": "DRIVE_ID" },
    { "name": "file-id", "value": "PARENT_DIRECTORY_ID" },
    { "name": "name", "value": "DIRECTORY_NAME" }
  ],
  "format": "json"
}
```

4. Upload a local file with `infomaniak_mutate`:

```json
{
  "namespace": "kdrive",
  "command": "upload-file",
  "options": [
    { "name": "drive-id", "value": "DRIVE_ID" },
    { "name": "file", "value": "/absolute/local/file.txt" },
    { "name": "directory-id", "value": "TARGET_DIRECTORY_ID" },
    { "name": "file-name", "value": "REMOTE_FILE_NAME" },
    { "name": "conflict", "value": "error" }
  ],
  "format": "json"
}
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

## Plain macOS/Linux Shell Fallback

Use this only outside OpenClaw tools, or when debugging locally. Keep examples compatible with a standard macOS or Linux shell. Do not require Rust CLI tools such as `rg` or `fd`; do not require `jq`.

Check the binary and command help:

```sh
command -v pot
pot --help | grep 'kdrive create-directory'
pot --help | grep 'kdrive upload-file'
```

Create a small local file safely:

```sh
tmp_file=$(mktemp)
printf 'hello\n' > "$tmp_file"
```

Create a directory when you already know the drive and parent directory ids:

```sh
pot kdrive create-directory \
  --drive-id "$DRIVE_ID" \
  --file-id "$PARENT_DIRECTORY_ID" \
  --name "$DIRECTORY_NAME" \
  --format json
```

Upload a file when you already know the target directory id:

```sh
pot kdrive upload-file \
  --drive-id "$DRIVE_ID" \
  --file "$tmp_file" \
  --directory-id "$TARGET_DIRECTORY_ID" \
  --file-name "$REMOTE_FILE_NAME" \
  --conflict error \
  --format json
```

Clean up only the local temporary file after upload:

```sh
rm -f "$tmp_file"
```
