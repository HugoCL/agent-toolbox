# Merge rule

## Reading `mergeRequirements`

The probe combines classic branch protection, active rulesets, and the merge queue (GraphQL). Pass `--base <branch>` for the PR's actual base. With no base supplied, the probe uses the repository's default branch. Read `branch` and `branchSource` in the result.

- `requiredApprovals.atLeast` is the highest approval count found. With `exact: true`, the sources were readable and the review conditions were understood. With `exact: false`, the real requirement may be higher or include additional conditions, even when `atLeast` is zero.
- `unsupported` lists review conditions the probe cannot fully evaluate, such as code-owner review, approval of the most recent reviewable push, or review-thread resolution. An entry makes the result partial.
- `sources.branchProtection.state` is `rule`, `none` (GitHub answered "Branch not protected") or `cannot-read` (403 or another 404).
- `ok: false` means the probe could establish neither protection nor rulesets.
- `requiredStatusChecks` lists the check names the branch requires. `mergeQueue: true` means a PR merges through the queue.

## What an agent does

1. Before any merge or enqueue, run `gh pr view <n> --json reviewDecision,mergeStateStatus,baseRefName`. Check that the probe covers this base and rerun it with `--base` if needed. The probe describes the branch. The PR check decides whether this PR can proceed. Stop when the PR state indicates a blocker or cannot be verified.
2. When reviews are required or the rule is partial or unreadable, stop with the PR ready unless its `reviewDecision` is `APPROVED`. Verify the required approving reviews are present and come from accounts other than the agent's. For a partial or unreadable rule, require at least one human approval, or the reported minimum if it is higher.
3. Merge only after the required checks are green and the user has asked for the merge. With an exact count of zero, say that the repository required no approval.
4. If the branch uses a merge queue, enqueue the PR only under these same conditions. Follow the repository's merge methods and any additional instructions in its AGENTS.md or CODEOWNERS rules.

## Never

- Approve your own PR.
- Ask another agent or a bot account to approve it.
- Merge with admin rights over a rule, or change branch protection, rulesets or required checks to get past one.
