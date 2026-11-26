# agent-toolbox

Skills for coding agents. You install them into the repos you work in, so Codex, T3 Code, Orca and Claude Code follow the same workflows: plan, implement, verify, review, open a PR, and merge only when the repo's rules are met.

The repo holds no app. It holds skill folders under `.agents/skills/`, a script that vendors skills from upstream repos at pinned commits, a way to keep local patches on top of them, and an installer.

## Install into a repo

```sh
git clone https://github.com/HugoCL/agent-toolbox.git && cd agent-toolbox
pnpm install
pnpm skills:install --target ~/work/my-repo --collections toolbox,tstack,cursor-team-kit
```

Add `--dry-run` to see what would change. `--skills a,b` adds single skills, and `--dest claude` or `--dest codex` writes to `.claude/skills` or `.codex/skills` instead of `.agents/skills`. The installer needs only Node 22, so `node scripts/install.mjs` works without `pnpm install`. It writes `<target>/.agents/agent-toolbox.json`, which records what was installed and from which commit. Commit the result in the target repo.

Where each harness reads skills:

| Harness | Reads |
| --- | --- |
| Claude Code | `.claude/skills` (use `--dest claude`) |
| Codex | `.agents/skills` or `.codex/skills` in a repo: **UNCONFIRMED**. The Codex docs say `.agents/skills`, but this repo has not checked it in a live session. Check the loaded skills |
| T3 Code, Orca | The skills of the agent they run. Orca itself is **UNCONFIRMED**, see `.agents/skills/harness-map/references/orca.md` |
| Cursor, Gemini CLI, Antigravity | `.agents/skills` |

## Update

```sh
git pull && pnpm install
pnpm skills:install --target ~/work/my-repo --collections toolbox,tstack,cursor-team-kit
```

A skill folder in the target that differs from this repo is not overwritten. The installer says whether it is an outdated copy of an earlier install or was modified in the target, writes nothing, and exits with an error. Look at the diff in the target repo, then add `--force`.

## Install only what you use

OpenAI's guidance for GPT-6 says that when too many skills are installed, Codex shortens their descriptions to fit (developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra). This repo has 95 skills. Install the collections you use, not all of them.

## Collections

| Id | Upstream | Skills | Use it for |
| --- | --- | --- | --- |
| `toolbox` | this repo | 4 | `discover`, `subagent-routing`, `harness-map`, `review-evidence` |
| `tstack` | [t3dotgg/tstack](https://github.com/t3dotgg/tstack) | 6 | `sol-loop`, PR filing, babysitting, takeover, rebasing. `full-send`, `full-stop` and `council` are left out |
| `cursor-team-kit` | [cursor/plugins](https://github.com/cursor/plugins) | 5 | `make-pr-easy-to-review`, `deslop`, `thermo-nuclear-code-quality-review`, `control-ui`, `control-cli` |
| `pstack` | [cursor/plugins](https://github.com/cursor/plugins) | 59 | `poteto-mode` playbooks and the principle skills. Large: install it only if you use it |
| `superpowers` | [obra/superpowers](https://github.com/obra/superpowers) | 15 | Brainstorming, plans, TDD, debugging, subagent-driven development |
| `ponytail` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) | 6 | Terse coding mode and its review and audit skills |

The generated catalog, with limits and local patches, is in `docs/skills.md`.

## Start with these three

1. `review-evidence`: a screenshot, a before and after, or a short captioned video of the change working, attached to the PR. Demo data only.
2. `make-pr-easy-to-review`: shapes the branch and PR so a person can review it.
3. `sol-loop`: a Sol reviewer checks the change in a loop before the PR.

```sh
pnpm skills:install --target ~/work/my-repo \
  --skills review-evidence,make-pr-easy-to-review,sol-loop,discover,subagent-routing,harness-map,babysit-pr,thermo-nuclear-code-quality-review
```

The five after them are what the first three link to or rely on. `discover` runs first in a session and states what the agent can use.

## Develop this repo

`AGENTS.md` has the rules for agents and for changing collections. Short version: `pnpm skills:sync` fetches upstream at the pinned commits and applies local patches, `pnpm skills:check` validates everything, and vendored skills are never edited by hand.

MIT for first-party content (`LICENSE`). Each vendored collection keeps its own license in `licenses/`.
