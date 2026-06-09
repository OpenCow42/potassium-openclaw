---
name: url-shortener
description: Use Infomaniak Chk URL shortener through the prebuilt Potassium CLI command pot and the OpenClaw infomaniak plugin. Use when an agent needs to create short links, list existing short links, check quota, update expiration dates, compose chk.me public URLs from returned codes, or handle url-shortener pot quirks while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# URL Shortener

Use this skill to manage Infomaniak Chk short links with Potassium's `pot` command through OpenClaw.

## Safety

- Prefer the OpenClaw `infomaniak_*` tools over direct shell commands.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not print token values in summaries, command output, scratch files, or error messages.
- Treat short-link creation and expiration updates as mutations.
- If `infomaniak_mutate` is unavailable or `mutationMode` is not `allow`, explain that the operator must enable mutation support before creating or updating short links.
- Do not invent raw HTTP calls or URL-shortener operations not exposed by `pot`; search the command catalog or check `pot --help` first.
- The public short-link domain is `chk.me`. When `pot` returns only a code, compose the public URL as `https://chk.me/CODE`.

## OpenClaw Workflow

1. Discover available commands when unsure.
   - Use `infomaniak_search_commands` with `namespace: "url-shortener"`.
   - Prefer `list`, `quota`, `create`, and `update` unless the installed `pot` and server both support the `-v2` command you need.

2. Check quota before creating many links.

```json
{
  "namespace": "url-shortener",
  "command": "quota",
  "options": [],
  "format": "json"
}
```

3. Create a short link with `infomaniak_mutate`.
   - Use the exact destination URL requested by the user.
   - Add `expiration-date` when the user requested one, or when the installed `pot` cannot decode creation responses with null expiration dates.
   - Use a Unix timestamp in seconds for `expiration-date`.
   - If `create-v2` returns a server-side method error, retry with `create`.

```json
{
  "namespace": "url-shortener",
  "command": "create",
  "options": [
    { "name": "url", "value": "https://example.com" },
    { "name": "expiration-date", "value": 1783551287 }
  ],
  "format": "json"
}
```

4. List short links after creating one.
   - Use `infomaniak_read` with `command: "list"` first.
   - If the installed `pot` fails to decode a list because an existing link has a null expiration date, try `list-v2`.
   - If both list commands fail with the same decode error, report the local `pot` decoder issue instead of retrying create repeatedly.

```json
{
  "namespace": "url-shortener",
  "command": "list",
  "options": [],
  "format": "json"
}
```

5. Update a short-link expiration only when explicitly requested.

```json
{
  "namespace": "url-shortener",
  "command": "update",
  "options": [
    { "name": "short-url-code", "value": "CODE" },
    { "name": "expiration-date", "value": 1783551287 }
  ],
  "format": "json"
}
```

6. Summarize the useful result.
   - Include destination URL, short code, public `https://chk.me/CODE` URL, and expiration date when known.
   - Mention any `pot` decode issue clearly if the remote action likely succeeded but `pot` could not parse the response.

## Common pot Commands

- `url-shortener quota` and `quota-v2`: read current usage and limits.
- `url-shortener list` and `list-v2`: list existing short links.
- `url-shortener create`: create a short link.
- `url-shortener create-v2`: use only when the installed server supports POST on the v2 route.
- `url-shortener update`: update an existing short link expiration date.

## Plain macOS/Linux Shell Fallback

Use this only outside OpenClaw tools, or when debugging locally. Keep examples compatible with a standard macOS or Linux shell. Do not require Rust CLI tools such as `rg` or `fd`; do not require `jq`.

Check the binary and URL-shortener commands:

```sh
command -v pot
pot --help | grep 'url-shortener create'
pot --help | grep 'url-shortener list'
```

Check quota:

```sh
pot url-shortener quota --format json
```

Create a short URL with a 30-day expiration:

```sh
EXPIRATION_DATE=$(( $(date +%s) + 2592000 ))
pot url-shortener create \
  --url "$TARGET_URL" \
  --expiration-date "$EXPIRATION_DATE" \
  --format json
```

List links:

```sh
pot url-shortener list --format json
```

Try v2 list only if v1 list is unavailable or fails:

```sh
pot url-shortener list-v2 --format json
```

Update an existing short URL expiration:

```sh
EXPIRATION_DATE=$(( $(date +%s) + 2592000 ))
pot url-shortener update \
  --short-url-code "$SHORT_URL_CODE" \
  --expiration-date "$EXPIRATION_DATE" \
  --format json
```
