---
name: kchat-posting
description: Post messages to Infomaniak kChat through Potassium's native OpenClaw tools backed by the liquid-potassium Node SDK. Use when an agent needs to find kChat teams or channels, create kChat posts, reply in threads with root ids, or post after resolving a channel while following Infomaniak token safety rules.
homepage: https://github.com/OpenCow42/potassium-openclaw
user-invocable: true
metadata: {"openclaw":{"requires":{"config":["plugins.entries.potassium.enabled"],"env":["INFOMANIAK_TOKEN"]},"primaryEnv":"INFOMANIAK_TOKEN"}}
---

# kChat Posting

Use this skill to post to kChat through `infomaniak_workflow_run`.

## Safety

- Do not invoke external binaries or shell commands for kChat API work.
- Never ask the user to paste an Infomaniak bearer token.
- Rely on `INFOMANIAK_TOKEN` or the configured `tokenEnvName`.
- Do not print token values in summaries, tool input echoes, error messages, or scratch files.
- Treat `createPost` and any create/update/delete kChat action as mutations.
- Post only when the user explicitly requested it.
- Preserve requested message text exactly, including capitalization and emoji.

## Workflow

1. Resolve the kChat team.
   - If the user supplied a team name or slug, use it.
   - If no team is known, ask for the team name; do not guess from a channel name.
   - Run domain `kchat`, action `getTeamByName` when you need the team id.

2. Resolve the target channel id.
   - Prefer domain `kchat`, action `getChannelByNameForTeamName`.
   - For a user request like "general", first try channel name `general`.
   - Consider Mattermost-style default channels such as `town-square` only when their display name clearly matches the user's intent.
   - Use the returned `id` as `channel_id` for posting.

3. Create the root post.
   - Run domain `kchat`, action `createPost`.
   - Input should include `channel_id`, exact `message`, optional `root_id`, and optional `set_online`.
   - Set `confirm_mutating=true`.

4. Reply in a thread by creating another post in the same channel with `root_id` set to the root post id.

5. Summarize only useful result ids: team, channel, root post id, and reply post id.
