# Probes

`scripts/discover.mjs` runs these, each with a 10 second timeout. It never throws, writes nothing, and always exits 0.

| Key | What it answers |
| --- | --- |
| `gitRepo` | Inside a work tree, its root, the current branch, whether there is a commit yet |
| `gitRemote` | Remote name and URL (credentials stripped), and the GitHub owner and repo when it is one |
| `defaultBranch` | From the GitHub API, or from the local `<remote>/HEAD` ref when the API is not reachable (the reason says so, and the ref may be stale) |
| `ghInstalled`, `ghAuthenticated` | `gh` on PATH, and `gh auth status` exit code. The token is never read |
| `mergeRequirements` | Merge requirements for the branch named by `--base <branch>`, or for the default branch when omitted. Reports the branch read and any unsupported review conditions. See [merge rule](merge-rule.md) |
| `mergeMethods` | Allowed merge methods, ruleset restriction, auto-merge, delete-branch-on-merge, and your permissions. GitHub shows these settings only to accounts with push access |
| `codeowners`, `prTemplate`, `agentsMd` | Presence of the file, matched case-insensitively |
| `ffmpeg`, `ffprobe`, `magick` | On PATH, with the first line of the version output |
| `playwright` | Which recorder-compatible package resolves from the working directory (`playwright` or `@playwright/test`) |
| `playwrightCore` | Whether `playwright-core` resolves independently. The recorder requires one of the packages above |
| `agentBrowser` | `agent-browser` on PATH or in `node_modules/.bin` |
| `harnessHints` | Names of environment variables that suggest Claude Code, Codex, T3 Code, Cursor, Orca or Gemini CLI. Names only, never values. Hints, not proof |

What the script cannot see: the model list, the subagent tool and the browser tools of the session. See [session capabilities](session.md).
