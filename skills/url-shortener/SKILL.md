---
name: url-shortener
description: Use Infomaniak Chk URL shortener through the prebuilt Potassium CLI command pot and OpenClaw managed exec. Use when an agent needs to create short links, list existing short links, check quota, update expiration dates, compose chk.me public URLs from returned codes, or handle url-shortener pot quirks while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# URL Shortener

Use this skill to manage Infomaniak Chk short links with Potassium's `pot` command through OpenClaw managed `exec`.

## Safety

- Use OpenClaw's built-in `exec` tool to run `pot`; do not expect native plugin tools or service-prefixed OpenClaw tools.
- Use one `pot` invocation per `exec` call. Avoid shell chains, pipes, redirections, or inline scripts.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` in the OpenClaw execution environment.
- Do not print token values in summaries, command output, scratch files, or error messages.
- Treat short-link creation and expiration updates as mutations.
- Create or update short links only when the user explicitly requested it and OpenClaw exec approvals allow the command.
- Do not invent raw HTTP calls or URL-shortener operations not exposed by `pot`; check `pot url-shortener --help` first.
- The public short-link domain is `chk.me`. When `pot` returns only a code, compose the public URL as `https://chk.me/CODE`.

## OpenClaw Exec Workflow

1. Discover available commands when unsure.
   - Run `pot url-shortener --help`.
   - Prefer `list`, `quota`, `create`, and `update` unless the installed `pot` and server both support the `-v2` command you need.

2. Check quota before creating many links.

```sh
pot url-shortener quota --format json
```

3. Create a short link.
   - Use the exact destination URL requested by the user.
   - Add `expiration-date` when the user requested one, or when the installed `pot` cannot decode creation responses with null expiration dates.
   - Use a Unix timestamp in seconds for `expiration-date`.
   - If `create-v2` returns a server-side method error, retry with `create`.

```sh
pot url-shortener create \
  --url "$TARGET_URL" \
  --expiration-date "$EXPIRATION_DATE" \
  --format json
```

4. List short links after creating one.
   - Use `pot url-shortener list --format json` first.
   - If the installed `pot` fails to decode a list because an existing link has a null expiration date, try `list-v2`.
   - If both list commands fail with the same decode error, report the local `pot` decoder issue instead of retrying create repeatedly.

```sh
pot url-shortener list --format json
```

5. Update a short-link expiration only when explicitly requested.

```sh
pot url-shortener update \
  --short-url-code "$CODE" \
  --expiration-date "$EXPIRATION_DATE" \
  --format json
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

Check the binary and URL-shortener commands:

```sh
command -v pot
pot url-shortener --help
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
