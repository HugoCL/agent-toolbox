# Session capabilities

The script cannot see these. Read them from your own tool list and state them in the capabilities block.

## Subagent tool

Look for the tool that starts another agent: `Agent` (Claude Code), `spawn_agent` (Codex), `Task` (Cursor), `delegate_task` with `orchestrator_capabilities` (T3 Code), or a named subagent. Orca runs the tools of the agent inside it. If there is none, say so: delegated steps run inline, and a review panel is one reviewer at best. [harness map](../../harness-map/SKILL.md) has the call shapes.

## Models and providers

Read the live list: the model picker, the subagent tool's schema, or `orchestrator_capabilities`. Record each provider that has a model you can choose, and the effort levels offered.

- Use the IDs the list prints. Do not complete or guess a version.
- Count providers. One provider means the review panel has less diversity, because the reviewers share training and blind spots. Compensate: a reviewer with fresh context, a brief that asks it to break the change, and evidence it can re-run (commands and their output, not a summary).
- Routing profile: [subagent routing](../../subagent-routing/SKILL.md) picks one from what you found.

## Browser and computer use

Look for a browser tool (Playwright, a built-in browser pane, `agent-browser`), a desktop or computer-use tool, and image or video tools. The script reports only what is installed locally (`ffmpeg`, `ffprobe`, `magick`, Playwright, `agent-browser`). A tool being installed does not mean this session may call it. If none is reachable, say what evidence you cannot capture, and do not substitute a description for a screenshot.
