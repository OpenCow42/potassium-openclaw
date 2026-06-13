---
name: url-shortener
description: Use Infomaniak Chk URL shortener through Potassium's native OpenClaw tools backed by the liquid-potassium Node SDK. Use when an agent needs to create short links, list existing short links, check quota, update expiration dates, compose chk.me public URLs from returned codes, or handle URL-shortener workflows while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/potassium-openclaw
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.potassium.enabled"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN"}}
---

# URL Shortener

Use this skill to manage Infomaniak Chk short links through `infomaniak_workflow_run`.

## Safety

- Do not invoke external binaries or shell commands for URL-shortener API work.
- Never ask the user to paste an Infomaniak bearer token.
- Rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not print token values in summaries, tool input echoes, scratch files, or error messages.
- Treat short-link creation and expiration updates as mutations.
- Create or update short links only when the user explicitly requested it.
- The public short-link domain is `chk.me`. When the API returns only a code, compose the public URL as `https://chk.me/CODE`.

## Workflow

1. Check quota before creating many links.
   - Run domain `urlShortener`, action `getQuota`.

2. List existing short links when the user asks to inspect or verify.
   - Run domain `urlShortener`, action `listLinks`.

3. Create a short link only when explicitly requested.
   - Run domain `urlShortener`, action `createLink`.
   - Use the exact destination URL requested by the user.
   - Add `expiration_date` when the user requested one.
   - Use a Unix timestamp in seconds for `expiration_date`.
   - Set `confirm_mutating=true`.

4. Update a short-link expiration only when explicitly requested.
   - Run domain `urlShortener`, action `updateExpiration`.
   - Input requires `short_url_code` and `expiration_date`.
   - Set `confirm_mutating=true`.

5. Summarize the useful result.
   - Include destination URL, short code, public `https://chk.me/CODE` URL, and expiration date when known.
