---
name: harness-map
description: Adapt a skill or instruction when it names a tool or path this harness lacks, including orchestrator_capabilities, delegate_task, task_status, watch_pull_request, unwatch_pull_request, create_issue, t3_*, Task, AskQuestion, AskUserQuestion, Agent, spawn_agent, tools.pr.*, ~/.cursor/..., or ~/.claude/....
---

# Harness map

Run `$discover` first: it states which harness and tools this session has. Then check the active tool list. T3 exposes `orchestrator_capabilities` and `delegate_task` alongside tools from its underlying agent. `Agent`, `spawn_agent`, and `Task` point to Claude Code, Codex, and Cursor, respectively. Gemini CLI exposes named subagents and Antigravity can expose `invoke_subagent`. Orca runs terminal agents, so it shows the tools of the agent inside it. A host name or environment variable supplied by the session can help identify it. Paths such as `~/.cursor/`, `~/.claude/`, `~/.codex/`, and `~/.gemini/` are hints because several harnesses may be installed.

Use the operation below and open the matching reference for call shapes. Any **UNCONFIRMED** tool or parameter needs to appear in the live tool schema before use. An unavailable tool takes the fallback in its row. Preserve the user's authorization, model requirements, and the host's instructions on when to delegate.

Orca cells are all **UNCONFIRMED**: the information comes from a web search. Orca inherits the tools of the agent it runs, so read that agent's column first ([Orca](references/orca.md)).

| Capability | [T3 Code](references/t3.md) | [Claude Code](references/claude-code.md) | [Codex](references/codex.md) | [Cursor](references/cursor.md) | [Orca](references/orca.md) | [Gemini CLI / Antigravity](references/gemini.md) | No native tool |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Spawn on a chosen model | `delegate_task` with `target.model` and `target.options` | `Agent` with a Claude model alias | `spawn_agent` with `model` and `reasoning_effort` if offered | `Task` or custom subagent with `model` frontmatter | The inner agent's own tool. Starting another Orca agent from its CLI is **UNCONFIRMED** | Named Gemini subagent with `model`, or Antigravity subagent with its documented tier | Work inline if the skill permits it. Report any required missing reviewer |
| List available models | `orchestrator_capabilities` | `Agent` schema and model picker | `spawn_agent` schema and model picker | Model picker and subagent configuration | The inner agent's list **UNCONFIRMED** | `/model` in the CLI, or the app's model picker | Use the current model when allowed |
| Wait for a result | Follow the delegate's returned continuation. Use `t3_thread_wait` for threads | Foreground return or background completion notice | Native wait tool or completion notice | Foreground return or background completion | The inner agent's **UNCONFIRMED** | Named Gemini tool returns its result. Antigravity exposes async status | Collect each result inline |
| Ask the human | Use the active provider's question tool | `AskUserQuestion` when present | `request_user_input` when present | Check for `AskQuestion` | The inner agent's **UNCONFIRMED** | Gemini CLI `ask_user`. Antigravity uses its active question surface | Ask a plain question in the final reply |
| Watch PR / CI | `watch_pull_request` / `unwatch_pull_request` | `pr-wait`, with `Monitor` when present | `pr-wait` | `pr-wait` | `pr-wait` **UNCONFIRMED** whether Orca has its own watcher | `pr-wait` | Run the vendored [pr-wait](../babysit-pr/scripts/pr-wait) |
| Open a tracked PR | `pull_request_create` when present, or link an existing PR | `gh pr create` | `gh pr create` | Forge tool if exposed, otherwise `gh pr create` | `gh pr create` **UNCONFIRMED** whether Orca has its own | Forge tool if exposed, otherwise `gh pr create` | `gh pr create`, report the URL |
| Attach an image or video to a PR | `t3_attachment_prepare_upload` is for thread attachments. For the PR use the forge | `gh pr create --attach` or `gh pr edit --attach` | Same `gh` flags | Same `gh` flags | Same `gh` flags **UNCONFIRMED** | Same `gh` flags | Use `$review-evidence` for evidence links |
| Create/update issue | `create_issue` when exposed. Use active connector for update if needed | Follow tracker config | Follow tracker config | Follow tracker config | Follow tracker config **UNCONFIRMED** | Follow tracker config | `gh issue create` / `gh issue edit` when applicable |
| Model rules | Active provider's rules | `CLAUDE.md`, `~/.claude/rules/pstack-models.md` | `AGENTS.md` and `config.toml` | `.cursor/rules/`, `~/.cursor/rules/pstack-models.mdc` | The inner agent's files **UNCONFIRMED** | Gemini CLI `GEMINI.md`; Antigravity `.agents/rules/` or `AGENTS.md` | Read [subagent routing](../subagent-routing/SKILL.md) directly |

## Running T3-only skills elsewhere

- **`$sol-loop`.** Use one explicitly selected Sol reviewer per round. Start with a fresh review brief each round and collect the native completion. If the harness cannot run Sol, report that blocker. Keep the workflow's round limit and stop conditions.
- **`$babysit-pr`.** If T3's watcher is absent, follow the non-T3 section in the [babysit skill](../babysit-pr/SKILL.md). From the repo root, run `"$PWD/.agents/skills/babysit-pr/scripts/pr-wait" <pr> --until ready`, or `--until green` when the repo has neither review bot named there. Use one watcher per PR.
- **pstack `Task` steps.** In Claude Code use the [vendored Cursor-to-Claude mapping](../../docs/harness/claude-code.md). Its `pstack:poteto-agent` and `pstack:comment-sicko` names need the pstack plugin, so translate them as the [Claude Code reference](references/claude-code.md) says. Elsewhere translate the brief, model, read-only access, and checkout isolation to your tool's actual fields. Report any missing behavior the step depends on. Read [subagent routing](../subagent-routing/SKILL.md) before choosing models.
