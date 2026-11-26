# agent-toolbox

A skills-only repo. Skills live in `.agents/skills/<name>/SKILL.md`. Other repos consume them with `pnpm skills:install`. Node 22 and pnpm 11. Use pnpm, never npm. The catalog is `docs/skills.md` (generated).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Installs the pinned `skills` CLI. The hardened pnpm config is in `pnpm-workspace.yaml` |
| `pnpm skills:sync [ids] [--update]` | Fetches the collections in `scripts/skills/sources.json` at the commits in `skills-lock.json`, applies local patches, prunes orphans, regenerates `docs/skills.md`. `--update` moves to upstream HEAD |
| `pnpm skills:check` | Validates frontmatter, the lock, content hashes, patches, symlinks and that `docs/skills.md` is fresh |
| `pnpm skills:install --target <dir> ...` | Copies skills into another repo. Flags are in the README |
| `pnpm skills:link` | Claude Code, inside this repo: symlinks `.agents/skills` into `.claude/skills` (gitignored) |

## Discover first

Before a workflow assumes a model, a tool, a browser or a merge rule, run `$discover` and state its capabilities block. Never assume a provider or model the live model list does not show. With one provider, say the review panel has less diversity and compensate: a fresh-context reviewer, an explicit adversarial brief, and evidence that can be re-run. `$subagent-routing` then picks a profile (`openai-only` or `mixed`).

## Merge rule

- Merge only when the approvals the repo requires are already present.
- When the rule cannot be read, require at least one human approval and stop with the PR ready.
- Never approve your own PR. Never ask another agent or a bot account to approve it.

`$discover` reads the rule from branch protection, rulesets and the merge queue, and says when it could only read part of it (`.agents/skills/discover/references/merge-rule.md`).

## Collections

| Id | Skills | Kind |
| --- | --- | --- |
| `toolbox` | `discover`, `subagent-routing`, `harness-map`, `review-evidence` | First-party, edited in place |
| `tstack` | `babysit-pr`, `file-pr`, `leaving-pr-comments`, `modernize`, `sol-loop`, `takeover` | Vendored |
| `cursor-team-kit` | `thermo-nuclear-code-quality-review`, `make-pr-easy-to-review`, `deslop`, `control-ui`, `control-cli` | Vendored |
| `pstack` | 59 skills of the Claude Code tree, plus `.agents/docs` and `.agents/agents` | Vendored, with patches |
| `superpowers` | 15 skills | Vendored |
| `ponytail` | 6 skills | Vendored |

## Phase to skill

| Phase | Skills |
| --- | --- |
| Orient | `$discover`, then `$subagent-routing` and `$harness-map` |
| Plan | `$brainstorming`, `$writing-plans`, `$how`, `$architect` |
| Implement | `$poteto-mode`, `$test-driven-development`, `$executing-plans`, `$subagent-driven-development`, `$dispatching-parallel-agents`, `$ponytail` |
| Debug | `$systematic-debugging` |
| Verify | `$verification-before-completion`, `$control-ui`, `$control-cli`, `$review-evidence` |
| Before review | `$deslop`, then `$make-pr-easy-to-review` |
| Review | `$sol-loop`, `$thermo-nuclear-code-quality-review`, `$requesting-code-review`, `$ponytail-review`. Seats and models per `$subagent-routing` |
| PR | `$file-pr`, `$leaving-pr-comments`, `$babysit-pr`, `$modernize` |
| Feedback | `$receiving-code-review` |
| Hand off | The giver runs `$poteto-mode` "Pause safely". The receiver runs `$takeover` |

When a skill names a tool this harness lacks, use `$harness-map`.

## Local patches

A vendored folder is not edited by hand: `pnpm skills:check` fails on drift. To change one, add a patch.

- Patches live at `scripts/skills/patches/<skill>/<n>-<slug>.patch`. Paths are repo-relative (`a/.agents/skills/<skill>/...`, what `git diff` prints). The first line is `# Reason: <one line>`, and `git apply` ignores it.
- `pnpm skills:sync` fetches upstream, applies the patches in file name order, and records in `skills-lock.json` the hash of the patched folder and the sha256 of each patch. `pnpm skills:check` verifies both.
- If a patch no longer applies after an upstream change, `skills:sync` stops and names the skill and the patch, and `.agents/skills` is untouched. Rewrite the patch against the new upstream text.
- `docs/skills.md` lists the patches of each collection with their reasons.
- Make a patch: copy the synced folder aside, edit the copy, run `git diff --no-index` between them, fix the paths to `a/.agents/skills/...` and `b/.agents/skills/...`, add the reason line, then run `pnpm skills:sync <collection>`.
- Patches change skill folders only. Files copied as extras (`.agents/agents`, `.agents/docs`) cannot be patched.

## Add or update a collection

1. Edit `scripts/skills/sources.json`. Give `id`, `title`, `upstream`, `source` (a repo URL or a `/tree/<ref>/<path>` URL; a 40-hex commit there pins it), `skills` (a list or `"*"`), `license.upstreamPath`, `notes` and `limitations`. `extras` copies extra upstream files.
2. `pnpm skills:sync <id>`. It stages the collection, checks name collisions, then applies it.
3. Read the new skills. Grep them for references to skills this repo does not carry, and for hardcoded models. Fix with a patch.
4. `pnpm skills:check`, then commit the lock, `licenses/<id>.txt` and `docs/skills.md` with the manifest change.
5. Update one collection with `pnpm skills:sync <id> --update`. Update everything with `pnpm skills:sync --update`.

First-party skills (`local: true`, collection `toolbox`) are edited in place, are not in the lock, and only get their frontmatter checked.

## Rules

- Do not weaken the pnpm security settings in `pnpm-workspace.yaml`. Fix a failing install by pinning an older version or documenting an exception there.
- Do not hand-edit `.agents/skills/` for vendored skills, `skills-lock.json` or `licenses/`.
- Commit messages are conventional (`feat:`, `fix:`, `docs:`). Keep changes small.
- Where this repo cannot confirm a tool or a path, it says **UNCONFIRMED**. Keep doing that.
