---
name: kchat-posting
description: Post messages to Infomaniak kChat through the prebuilt Potassium CLI command pot and OpenClaw managed exec. Use when an agent needs to find kChat teams or channels, create kChat posts, reply in threads with root ids, or post after resolving a channel while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/tool-releases
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["pot"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN","install":[{"id":"brew-potassium","kind":"brew","formula":"opencow42/tap/potassium","bins":["pot"],"label":"Install Potassium CLI (brew)"}]}}
---

# kChat Posting

Use this skill to post to kChat with Potassium's `pot` command through OpenClaw managed `exec`.

## Safety

- Use OpenClaw's built-in `exec` tool to run `pot`; do not expect native plugin tools or service-prefixed OpenClaw tools.
- Use one `pot` invocation per `exec` call. Avoid shell chains, pipes, redirections, or inline scripts.
- Never ask the user to paste an Infomaniak bearer token.
- Never pass `--token` to `pot`; rely on `INFOMANIAK_TOKEN` in the OpenClaw execution environment.
- Do not print token values in summaries, command output, error messages, or scratch files.
- Treat `post-create`, file upload, and any create/update/delete action exposed by `pot` as mutations.
- Post only when the user explicitly requested it and OpenClaw exec approvals allow the command.
- Preserve requested message text exactly, including capitalization and emoji.

## OpenClaw Exec Workflow

1. Resolve the kChat team.
   - If the user supplied `--team-name` or a team slug, use it.
   - If no team is known, ask for the team name; do not guess from a channel name.
   - Run `pot kchat team-by-name` when you need the team id.

2. Resolve the target channel id.
   - Prefer `pot kchat channel-by-team-name-channel-name`.
   - For a user request like "general", first try channel name `general`; if that fails, search/list channels and consider Mattermost-style default channels such as `town-square` only when their display name clearly matches the user's intent.
   - Use the returned JSON `id` as `channel-id` for posting.

3. Create the root post:

```sh
pot kchat post-create \
  --team-name "$TEAM_NAME" \
  --channel-id "$CHANNEL_ID" \
  --message "$MESSAGE" \
  --format json
```

4. Reply in a thread by creating another post in the same channel with `root-id` set to the root post id:

```sh
pot kchat post-create \
  --team-name "$TEAM_NAME" \
  --channel-id "$CHANNEL_ID" \
  --message "$THREAD_REPLY" \
  --root-id "$ROOT_POST_ID" \
  --format json
```

5. Summarize only the useful result ids: team, channel, root post id, and reply post id.

## Common pot Commands

- `kchat team-by-name`: resolve a team by name.
- `kchat channel-by-team-name-channel-name`: resolve a channel by team and channel name.
- `kchat post-create`: create a root post or thread reply.

```sh
command -v pot
pot kchat --help
```
