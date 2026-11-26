# Harness capture

Read the session's tool list first. Use the repository's `$discover` skill if available. Work with tools visible in this session and check their schemas for screenshot paths, recording limits, and how to set viewport and appearance. If a harness has no local capture export, use the scripted route.

- **T3 Code, observed.** Available sessions have exposed `preview_open`, `preview_navigate`, `preview_act`, `preview_wait_for`, `preview_resize`, `preview_set_appearance`, `preview_snapshot`, `preview_recording_start`, and `preview_recording_stop`. Stop returns a local recording path with a 50 MiB maximum. T3 also has device tools for simulators. Check the current tools before choosing the capture path.
- **Codex app, UNCONFIRMED in a live session.** OpenAI recommends its in-app browser for local web apps. The macOS Computer Use plugin requires Screen Recording and Accessibility permissions. Video export from either surface is **UNCONFIRMED**. Check the tools and their output. [Built-in browser](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app) · [macOS permissions](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)
- **Orca, UNCONFIRMED in a live session.** Docs describe a built-in browser per worktree and CLI screenshot export. Check which browser and output options the current tools expose. [Per-worktree browser](https://orca.dev/docs/browser/overview) · [CLI reference](https://orca.dev/docs/cli/reference)

Start on the seeded state, wait for the changed element, and capture only the part of the session the reviewer needs. If you have stills only, label the steps in the PR in order, or use the scripted recorder when timing or motion matters.
