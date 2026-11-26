---
name: subagent-routing
description: Choose models and reasoning effort for subagents launched by sol-loop, poteto-mode, swarm, arena, dispatching-parallel-agents, or other delegation workflows, using the providers that $discover found.
---

# Subagent routing

Run `$discover` first. It tells you which providers the live model list offers. This skill turns that into a profile and a model per role. Version IDs always come from the live model list: use the newest listed ID of the family a row names, and never write a version number from memory.

An explicit requirement in the task wins, such as "Sol only" in `$sol-loop`. A user's request in the thread overrides a table for that task. Check [harness map](../harness-map/SKILL.md) for the delegation mechanism.

## Pick a profile

| Found by `$discover` | Profile |
| --- | --- |
| Only OpenAI models are offered | `openai-only` |
| Two or more providers are offered | `mixed` |
| One provider that is not OpenAI | `mixed`, using only that provider's rows and the fallbacks below |

Say which profile you chose and why. In `openai-only` and in any one-provider setup the review panel has less diversity: apply the compensation under Review.

## Profile `openai-only`

| Role | Model | Effort |
| --- | --- | --- |
| Implementation and everyday coding | latest GPT Sol | high |
| Hardest problems, or work that crosses services | latest GPT Astra | high |
| Focused high-volume work: triage, extraction, mechanical edits, scheduled jobs | latest GPT Luna | start at high |
| Writing, visual understanding, computer use | latest GPT Terra | high |
| Review | fresh-context GPT Sol, plus an Astra seat for risky changes | high |

A risky change touches auth, data loss, money or concurrency.

What OpenAI says about these models (Codex models page, November 2026):

- Sol is for everyday coding and writing. Astra is for demanding projects.
- Luna is the most efficient, for focused high-volume tasks. It supports effort up to Max, and OpenAI says to start it at High.
- Terra is fast, for clear writing, visual understanding and computer use.
- Effort levels are Light (Low in the CLI), Medium, High, Extra High, Max and Ultra. Ultra uses subagents, so do not give Ultra to a role that must not start subagents, such as the `$sol-loop` reviewer.

## Profile `mixed`

| Role | Model | Effort |
| --- | --- | --- |
| Implementation | latest Claude Opus | high |
| Simple, low-risk work (mechanical edits, lookups, running commands) | latest Claude Sonnet, or latest GPT Sol | high |
| Review: adversarial seat | same model as the parent thread | high |
| Review: second and third seats | GPT Sol and latest Claude Opus | high |

Edit these tables when the team wants a new default, and keep the rest of this skill in sync.

## Review

Give the reviewer the diff and the original goal, never the author's conclusion, and ask for findings with `file:line` references and a score out of 10. Keep reviewers independent and read-only. Brief every reviewer to cover two lenses and to label each finding with one:

- **Correctness:** bugs, regressions, security, broken commands or docs, missing proof for a behavior change.
- **Maintainability:** apply `$thermo-nuclear-code-quality-review` (load it by name; it sets `disable-model-invocation`). Scope it to the PR's own diff. A restructuring that needs a separate change becomes a follow-up, not a blocker.

`openai-only`: one fresh-context Sol at high, plus an Astra seat when the change is risky. Single provider means less diversity, so compensate: the reviewer starts with no author context, the brief tells it to try to break the change, and every claim in the findings needs a command, output or test you can re-run.

`mixed`: always add a read-only adversarial reviewer on the same model as the parent, then GPT Sol and Claude Opus. If the parent is Sol or Opus, it fills its own seat and the other model fills the second. If only one of the two is available, use it and keep the parent-model seat when distinct.

Report missing seats and any effort level the harness cannot set.

## Fallback order

- **Opus:** latest Claude Opus, then latest Claude Fable, then latest Claude Sonnet.
- **Sol:** latest GPT Sol, then the newest older Sol, then latest Gemini Neon.
- **Sonnet:** latest Claude Sonnet, then latest GPT Sol, then latest Claude Haiku.
- **Astra, Luna, Terra:** the family itself, then latest GPT Sol.

Apply a fallback only where the workflow allows substitutions, skip duplicates, and report each substitution. If the exact parent model cannot be selected, use inheritance only if it resolves to that model. Respect explicit provider requirements instead of silently substituting.

## Set the model and effort

| Harness | Selection |
| --- | --- |
| Claude Code | `Agent` with an alias such as `model: "opus"` and `effort: "high"` where exposed |
| Codex | `spawn_agent` with `model` and `reasoning_effort` |
| Cursor | Custom subagent frontmatter `model` with an available ID. See [Cursor](../harness-map/references/cursor.md) for the **UNCONFIRMED** per-invocation field |
| T3 Code | Choose values from `orchestrator_capabilities`, then pass `target.model` and supported `target.options` to `delegate_task` |
| Orca | It runs terminal agents, so use the selection of the agent inside it. **UNCONFIRMED**, see [Orca](../harness-map/references/orca.md) |
| Gemini CLI / Antigravity | Use the supported subagent model or tier in [Gemini and Antigravity](../harness-map/references/gemini.md) |

`$setup-pstack` writes user-scoped rules outside the repo. This skill is the repository source of truth for model choices. Resolve the role and effort here first, then translate to the harness with [harness map](../harness-map/SKILL.md).
