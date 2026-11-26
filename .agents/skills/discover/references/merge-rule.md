# Merge rule

## Reading `mergeRequirements`

The probe combines three sources for the default branch: classic branch protection, active rulesets, and the merge queue (GraphQL).

- `requiredApprovals.atLeast` is the highest approval count found. `exact: true` means every source was readable, so the number is the requirement. `exact: false` means at least one source was not, so the real requirement may be higher. Never read `atLeast: 0` with `exact: false` as "no approval needed".
- `sources.branchProtection.state` is `rule`, `none` (GitHub answered "Branch not protected") or `cannot-read` (403 or another 404). `none` is a real answer. `cannot-read` is not.
- `ok: false` means neither protection nor rulesets could be read.
- `requiredStatusChecks` lists the check names the branch requires. `mergeQueue: true` means a PR merges through the queue.

## What an agent does

1. The probe is `exact: true` with N approvals required: merge only when the PR already has N approving reviews from accounts that are not the agent's, all required checks are green, and the user asked for the merge.
2. The probe is `exact: true` with 0 required: the repo does not require a review. Merge only when the user asked for it, and say that no review was required.
3. The rule cannot be read (`ok: false`, or `exact: false` with nothing found): treat it as needing at least one human approval. Stop with the PR ready and say what is missing.
4. A merge queue: enqueue the PR (for example `gh pr merge --auto`) only under the same conditions. Do not bypass the queue.
5. Use a merge method from `mergeMethods.allowed`. If the repo's AGENTS.md or a CODEOWNERS rule says more, follow it.

## Never

- Approve your own PR.
- Ask another agent or a bot account to approve it.
- Merge with admin rights over a rule, or change branch protection, rulesets or required checks to get past one.
