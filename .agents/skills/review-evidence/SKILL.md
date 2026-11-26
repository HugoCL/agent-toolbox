---
name: review-evidence
description: Capture evidence for a PR with visible behavior, when asked for a demo, capture, recording, GIF, or before and after comparison, or when a reviewer asks to see a change working.
---

# Review evidence

Give the reviewer enough evidence to see the change working before reading the diff.

## Choose the smallest useful capture

1. **Harness capture.** For a static change, take screenshots at the widths that matter and in light and dark if both exist. For a simple interaction, use a quick clip or a short sequence of captioned stills. See [harness capture](references/harness-capture.md).
2. **Scripted recording.** For a 15 to 40 second flow, use a captioned MP4. See [scripted recording](references/scripted-recording.md) and [recorder.mjs](scripts/recorder.mjs).
3. **Before and after.** For polish across several spots, capture matched pairs. See [before and after](references/before-after.md) and the [capture](scripts/before-after/capture.mjs) and [render](scripts/before-after/render.mjs) scripts.

For a change with no visible behavior, include relevant command output.

## Capture and share safely

Use only seeded demo data, a local backend, and a test user. Always fence the browser to an explicit host allow list and abort the take if it attempts to reach another host. If the harness cannot enforce that boundary, use the scripted route. Never capture production data, accounts, or credentials.

Verify the capture and inspect the actual frames for real names and personal data before showing or attaching anything. Use [the verification checklist](references/verify.md) and [verify.mjs](scripts/verify.mjs). Use [to-gif.mjs](scripts/to-gif.mjs) only if the destination cannot play video.

By default, attach the evidence to the PR body or a comment. See [attachment instructions](references/attach.md) for the Evidence entry and what to report.
