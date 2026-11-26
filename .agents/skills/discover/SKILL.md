---
name: discover
description: Find out what this session and repo can actually do before a workflow assumes it. Run first in a new session or repo, and before delegating, reviewing, merging, or recording evidence.
---

# Discover

Check before you assume. A skill may name a model, a tool, a merge rule or a browser. Find out what exists here, then say it.

## Steps

1. Run the script from the repo you are working in. It is read-only and prints JSON:

   ```sh
   node .agents/skills/discover/scripts/discover.mjs
   ```

   If the skills live elsewhere (`.claude/skills`, `.codex/skills`, a global folder), run the script from there with the repo as the working directory. Each probe is `{ ok: true, value }` or `{ ok: false, reason }`. `ok: false` means absent or unreadable, and the reason says which. The probes are listed in [probes](references/probes.md).
2. Read what the script cannot see from your own tool list: the subagent tool, the live model list and its providers, and any browser or computer-use tool. How: [session capabilities](references/session.md).
3. State the capabilities block below, then continue.

## Rules

- Never assume a provider or model the live model list does not show. Version IDs come from that list.
- With one provider, say the review panel has less diversity. Compensate with a fresh-context reviewer, an explicit adversarial brief, and runnable evidence.
- Merge rule, in full in [merge rule](references/merge-rule.md): an agent merges only when the approvals the repo requires are already present. When the rule cannot be read, it needs at least one human approval, and you stop with the PR ready.
- Never approve your own PR, and never ask another agent or a bot account to approve it.
- Environment variables are hints about the harness, not proof. Your tool list decides.

## Capabilities block

State this before continuing, one line per item, with `unknown` where you could not tell:

```
Capabilities
- Harness: <name, from the tool list; env hint if any>
- Subagents: <tool name, or none>
- Providers and models: <from the live list>; review diversity: <multi-provider | single-provider>
- Browser / computer use: <tool, or none>; local: <ffmpeg, ffprobe, magick, Playwright, agent-browser: yes/no each>
- Git and GitHub: <repo, remote, default branch>; gh: <authenticated or not>
- Merge rule: <required approvals, required checks, merge queue; complete or partial>
- Merge methods: <allowed>; CODEOWNERS: <yes/no>; PR template: <yes/no>; AGENTS.md: <yes/no>
- Next: <the routing profile from $subagent-routing, and what you will do first>
```
