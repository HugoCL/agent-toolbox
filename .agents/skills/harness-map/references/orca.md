# Orca

**UNCONFIRMED.** This page comes from a web search, not from running Orca or reading its docs. Orca ([stablyai/orca](https://github.com/stablyai/orca)) is described as a desktop workspace that runs terminal agents such as Claude Code and Codex, with one git worktree per agent, a built-in browser per worktree, and a CLI. Check each claim below against the live tool list and Orca's own docs before relying on it.

## What follows from that description

- Orca inherits the tools of the agent it runs. The agent inside decides which skills it reads, which subagent tool it has and which models it offers. Use that agent's column in [harness map](../SKILL.md): Claude Code, Codex, or whichever is running. Orca adds nothing to the model list.
- Each agent has its own worktree. Treat it like any isolated checkout: commit before handing work to another agent, and expect the base to be the default branch unless told otherwise. **UNCONFIRMED**
- A built-in browser per worktree and a CLI exist. Whether the agent can call the browser, and the CLI's commands, are **UNCONFIRMED**. Look for a browser tool in the live tool list. If there is none, use Playwright or `agent-browser` from `$discover`.
- Skills are read from the folder the inner agent reads (`.claude/skills` for Claude Code, `.agents/skills` or `.codex/skills` for Codex, see the Codex page). **UNCONFIRMED** for Orca itself.
- Orca's own PR, issue and watch features are **UNCONFIRMED**. Use `gh` and the [vendored waiter](../../babysit-pr/scripts/pr-wait).
