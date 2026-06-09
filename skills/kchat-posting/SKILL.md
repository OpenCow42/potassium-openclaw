---
name: kchat-posting
description: Post messages to Infomaniak kChat through the prebuilt Potassium CLI command pot and the OpenClaw infomaniak plugin. Use when an agent needs to find kChat teams or channels, create kChat posts, reply in threads with root ids, or post after resolving a channel while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# kChat Posting

Use this skill to post to kChat with Potassium's `pot` command through OpenClaw.

## Safety

- Prefer the OpenClaw `infomaniak_*` tools over direct shell commands.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not print token values in summaries, command output, error messages, or scratch files.
- Treat `post-create`, file upload, and any create/update/delete action exposed by `pot` as mutations.
- If `infomaniak_mutate` is unavailable or `mutationMode` is not `allow`, explain that the operator must enable mutation support before posting.
- Preserve requested message text exactly, including capitalization and emoji.

## OpenClaw Workflow

1. Resolve the kChat team.
   - If the user supplied `--team-name` or a team slug, use it.
   - If no team is known, ask for the team name; do not guess from a channel name.
   - Use `infomaniak_read` with `namespace: "kchat"`, `command: "team-by-name"`, and options `team-name` plus `name` when you need the team id.

2. Resolve the target channel id.
   - Prefer `infomaniak_read` with `command: "channel-by-team-name-channel-name"` and options `team-name` and `channel-name`.
   - For a user request like "general", first try channel name `general`; if that fails, search/list channels and consider Mattermost-style default channels such as `town-square` only when their display name clearly matches the user's intent.
   - Use the returned JSON `id` as `channel-id` for posting.

3. Create the root post with `infomaniak_mutate`:

```json
{
  "namespace": "kchat",
  "command": "post-create",
  "options": [
    { "name": "team-name", "value": "TEAM_NAME" },
    { "name": "channel-id", "value": "CHANNEL_ID" },
    { "name": "message", "value": "MESSAGE" }
  ],
  "format": "json"
}
```

4. Reply in a thread by creating another post in the same channel with `root-id` set to the root post id:

```json
{
  "namespace": "kchat",
  "command": "post-create",
  "options": [
    { "name": "team-name", "value": "TEAM_NAME" },
    { "name": "channel-id", "value": "CHANNEL_ID" },
    { "name": "message", "value": "THREAD_REPLY" },
    { "name": "root-id", "value": "ROOT_POST_ID" }
  ],
  "format": "json"
}
```

5. Summarize only the useful result ids: team, channel, root post id, and reply post id.

## Plain macOS Shell Fallback

Use this only outside OpenClaw tools, or when debugging locally. Keep examples compatible with a stock macOS shell; do not require Rust CLI tools such as `rg` or `fd`, and do not require `jq`.

Check the binary and command help:

```sh
command -v pot
pot --help | grep 'kchat post-create'
```

Post a message when you already know the team and channel id:

```sh
pot kchat post-create \
  --team-name "$TEAM_NAME" \
  --channel-id "$CHANNEL_ID" \
  --message "$MESSAGE" \
  --format json
```

Reply in a thread when you already know the root post id:

```sh
pot kchat post-create \
  --team-name "$TEAM_NAME" \
  --channel-id "$CHANNEL_ID" \
  --message "$REPLY" \
  --root-id "$ROOT_POST_ID" \
  --format json
```
