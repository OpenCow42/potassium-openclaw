# URL Shortener

The `url-shortener` skill documents Infomaniak Chk short-link workflows through
Potassium's reviewed `urlShortener` domain actions. It covers quota checks,
listing links, creating links, updating expiration dates, and presenting public
`chk.me` URLs.

The executable skill instructions live in
[`skills/url-shortener/SKILL.md`](../skills/url-shortener/SKILL.md).

## Capabilities

- Check short-link quota.
- List existing short links.
- Create a new short link for a destination URL.
- Set an expiration date at creation time.
- Update the expiration date for an existing short-link code.
- Compose the public `https://chk.me/CODE` URL when the API returns only a code.

## Safety Model

Short-link creation and expiration updates are mutations. Agents using this
skill should:

- rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`;
- never ask the user to paste an Infomaniak bearer token;
- avoid printing token values in summaries, tool echoes, scratch files, or
  errors;
- create or update links only when the user explicitly requested the action;
- set `confirm_mutating=true` for create and update calls;
- avoid shell commands or external binaries for URL-shortener API work.

## Workflow

1. Check quota before creating many links.

   Run domain `urlShortener`, action `getQuota`.

2. List links when the user asks to inspect, audit, or verify.

   Run domain `urlShortener`, action `listLinks`.

3. Create a link only when explicitly requested.

   Run domain `urlShortener`, action `createLink`. Use the exact destination URL
   requested by the user. Add `expiration_date` when requested. Use a Unix
   timestamp in seconds for `expiration_date`. Set `confirm_mutating=true`.

4. Update an expiration only when explicitly requested.

   Run domain `urlShortener`, action `updateExpiration`. Input requires
   `short_url_code` and `expiration_date`. Set `confirm_mutating=true`.

5. Summarize the result.

   Include the destination URL, short code, public `https://chk.me/CODE` URL,
   and expiration date when known.

## Expiration Dates

When the user gives a human date, convert it to the Unix timestamp expected by
the workflow before calling the action. Be explicit about the interpreted date
when ambiguity matters, especially for relative dates or missing time zones.

## Result Summary

For created links, report:

- destination URL;
- short code;
- public short URL;
- expiration date when set.

For quota or listing calls, summarize counts and the most relevant links rather
than dumping the entire response unless the user asks for raw data.

## Troubleshooting

- If a destination URL is missing or ambiguous, ask for the exact URL.
- If an expiration date is ambiguous, ask for a concrete date or state the
  interpretation before mutating.
- If the API returns only a short code, compose the public URL as
  `https://chk.me/CODE`.
- If plugin policy blocks mutation, report the policy block and stop.

## Related Docs

- [Potassium Skill](potassium.md)
- [Architecture](architecture.md)
- [Liquid Potassium Integration](liquid-potassium-integration.md)
