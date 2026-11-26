# Attach evidence to the PR

Use a forge attachment in the PR description or comment. Keep reviewer media off the feature branch unless it is itself product content, such as a changelog video. Thread attachments in an agent harness are visible to that thread and do not attach a file to the PR.

## GitHub CLI

Check both `gh pr create --help` and `gh pr edit --help` for `--attach`. Availability on other installations is **UNCONFIRMED**. Follow the installed CLI's syntax. The commands below use a prepared body without duplicate media references.

```sh
gh pr create --body-file body.md --attach './evidence.png#The updated queue'
gh pr edit 23 --body-file body.md --attach './evidence.png#The updated queue'
```

Use the command that matches the PR's state. When editing with a body file, preserve the existing description. The CLI upload needs a user token with repository write access. GitHub App installation tokens are rejected by the attachment endpoint. The endpoint's public API status is **UNCONFIRMED**. Use the supported flag instead of calling the endpoint directly. Private-repo viewer access, inline video rendering, and upload size limits are **UNCONFIRMED**. Verify on the real PR using a repository reader and the actual media type. [CLI upload implementation](https://github.com/cli/cli/blob/de06af2c2ea536d5722fda35dc2001565f9b9f64/internal/attachments/client.go) · [App token limitation](https://github.com/cli/cli/issues/14309)

In Capy, the live schema of the public-repo upload tool used by gstack is **UNCONFIRMED**. Check the session's tools before relying on it.

## Fallback when upload is unavailable

Only with authorization to publish media and update branches, place the files on an orphan `pr-evidence` branch of the same repository. Extend an existing evidence branch without overwriting its earlier assets. Use a unique path such as `pr-23/<commit>/queue.mp4`, keep the branch while the PR needs it, and link to it from the PR. The reference convention is `../blob/pr-evidence/<path>?raw=true`. Check the link on the actual PR and use a verified absolute forge link if it fails. Viewers need repository read access. Behavior after branch deletion is **UNCONFIRMED**. If publication is unavailable, put the relevant observed results in the PR as text. [GitHub relative links](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#relative-links)

## Evidence entry

Include what the reviewer should see, the full recorded commit SHA, the tool and setup used, and the limits of the capture, as in the example below.

> **Evidence**  
> Move “Invitation flow” from To review to Ready, then save the queue.  
> Recorded on `<head-sha>` with Playwright against the local seeded demo at 864×540 CSS pixels.  
> Covers desktop edit, drag, and save. Mobile behavior and concurrent edits were outside this take.

In the user report, give the local file path, duration, size, commit, verification results, what remains unverified, and the PR link when attached.
