#!/usr/bin/env node
// Read-only probe of what this session can use. Prints one JSON object and always exits 0.
// Every probe is { ok: true, value } or { ok: false, reason }. `ok: false` covers both "absent"
// and "could not be read"; the reason says which. Node 22, no dependencies.
//
// It runs git, gh, and the tools' version flags, with a timeout on each. It writes nothing and
// prints no secrets: environment variables are reported by name only, and `gh auth token` is
// never called.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseArgs } from "node:util";

const cwd = process.cwd();
const TIMEOUT_MS = 10_000;
let requestedBase;

const ok = (value) => ({ ok: true, value });
const no = (reason) => ({ ok: false, reason });

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: "1",
      GIT_TERMINAL_PROMPT: "0",
      NO_COLOR: "1",
    },
  });
  return {
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    missing: result.error?.code === "ENOENT",
    timedOut: result.error?.code === "ETIMEDOUT",
  };
}

// Runs a probe and turns anything it throws into { ok: false }.
function probe(fn) {
  try {
    return fn();
  } catch (error) {
    return no(`probe failed: ${error?.message ?? error}`);
  }
}

// --- git ---------------------------------------------------------------------------------

function gitRepo() {
  const top = run("git", ["rev-parse", "--show-toplevel"]);
  if (top.missing) return no("git is not installed");
  if (top.status !== 0) return no("not inside a git work tree");
  const branch = run("git", ["symbolic-ref", "--short", "-q", "HEAD"]);
  const head = run("git", ["rev-parse", "--verify", "-q", "HEAD"]);
  return ok({
    root: top.stdout,
    branch: branch.status === 0 ? branch.stdout : null,
    hasCommits: head.status === 0,
  });
}

function gitRemote() {
  const list = run("git", ["remote"]);
  if (list.status !== 0) return no("cannot list remotes");
  const names = list.stdout.split("\n").filter(Boolean);
  if (names.length === 0) return no("no remote configured");
  const name = names.includes("origin") ? "origin" : names[0];
  const raw = run("git", ["remote", "get-url", name]).stdout;
  const url = raw.replace(/\/\/[^@/]+@/, "//");
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  return ok({
    name,
    names,
    url,
    github: m ? { owner: m[1], repo: m[2] } : null,
  });
}

// --- gh ----------------------------------------------------------------------------------

function ghInstalled() {
  const r = run("gh", ["--version"]);
  if (r.missing) return no("gh not found on PATH");
  if (r.status !== 0) return no("gh --version failed");
  return ok(r.stdout.split("\n")[0]);
}

function ghAuth() {
  const r = run("gh", ["auth", "status"]);
  if (r.missing) return no("gh not found on PATH");
  if (r.timedOut) return no("gh auth status timed out");
  return r.status === 0 ? ok(true) : no("gh auth status reports no usable login");
}

// One gh api call. Returns { data } or { status, message } when GitHub refused or the call failed.
function ghApi(path, extra = []) {
  const r = run("gh", ["api", ...extra, path]);
  if (r.missing) return { status: null, message: "gh not found on PATH" };
  if (r.timedOut) return { status: null, message: "request timed out" };
  let body = null;
  try {
    body = JSON.parse(r.stdout);
  } catch {}
  if (r.status === 0) return { data: body };
  const status = /HTTP (\d{3})/.exec(r.stderr)?.[1] ?? body?.status ?? null;
  return {
    status: status === null ? null : Number(status),
    message: body?.message ?? r.stderr.split("\n")[0] ?? "request failed",
  };
}

// --- repo settings and merge rules ------------------------------------------------------

// Shared by several probes, fetched once.
const cache = {};
const remember = (key, fn) => (key in cache ? cache[key] : (cache[key] = fn()));

function target() {
  return remember("target", () => {
    const remote = gitRemote();
    if (!remote.ok) return { reason: `no remote: ${remote.reason}` };
    if (!remote.value.github)
      return { reason: "the remote is not a GitHub repository" };
    if (!ghInstalled().ok) return { reason: "gh is not installed" };
    if (!ghAuth().ok) return { reason: "gh is not authenticated" };
    return { ...remote.value.github, remote: remote.value.name };
  });
}

const repoPath = (t) => `repos/${t.owner}/${t.repo}`;

function repoInfo() {
  return remember("repoInfo", () => {
    const t = target();
    if (t.reason) return { message: t.reason };
    return ghApi(repoPath(t));
  });
}

function defaultBranch() {
  const info = repoInfo();
  if (info.data?.default_branch)
    return ok({ name: info.data.default_branch, source: "github api" });
  const t = target();
  const remote = t.remote ?? "origin";
  const ref = run("git", ["symbolic-ref", "--short", "-q", `refs/remotes/${remote}/HEAD`]);
  if (ref.status === 0 && ref.stdout.startsWith(`${remote}/`))
    return ok({
      name: ref.stdout.slice(remote.length + 1),
      source: `local ${remote}/HEAD (may be stale)`,
    });
  return no(
    `cannot determine it${info.message ? ` (github api: ${info.message})` : ""}`,
  );
}

function mergeBase() {
  return remember("mergeBase", () =>
    requestedBase ? ok({ name: requestedBase, source: "--base" }) : defaultBranch(),
  );
}

function branchName() {
  return mergeBase().value?.name ?? null;
}

const CLASSIC_REVIEW_FIELDS = new Set([
  "url", "dismissal_restrictions", "bypass_pull_request_allowances",
  "required_approving_review_count",
]);
const RULESET_REVIEW_FIELDS = new Set([
  "allowed_merge_methods", "required_approving_review_count",
]);
const OPTIONAL_REVIEW_FLAGS = new Set([
  "dismiss_stale_reviews", "dismiss_stale_reviews_on_push",
  "require_code_owner_reviews", "require_code_owner_review",
  "require_last_push_approval", "required_review_thread_resolution",
]);

function unsupportedReviewFields(fields, modeled, prefix) {
  return Object.entries(fields ?? {})
    .filter(([name, value]) =>
      !modeled.has(name) && !(OPTIONAL_REVIEW_FLAGS.has(name) && value === false),
    )
    .map(([name]) => `${prefix}.${name}`);
}

// Classic branch protection: { state: "rule" | "none" | "cannot-read", ... }.
function classicProtection() {
  return remember("classic", () => {
    const t = target();
    const branch = branchName();
    if (t.reason || !branch)
      return { state: "cannot-read", detail: t.reason ?? "no base branch" };
    const r = ghApi(`${repoPath(t)}/branches/${encodeURIComponent(branch)}/protection`);
    if (r.data) {
      const reviews = r.data.required_pull_request_reviews;
      const checks = r.data.required_status_checks;
      const unsupported = unsupportedReviewFields(reviews, CLASSIC_REVIEW_FIELDS, "branchProtection");
      if (r.data.required_conversation_resolution?.enabled)
        unsupported.push("branchProtection.required_conversation_resolution");
      return {
        state: "rule",
        approvals: reviews?.required_approving_review_count ?? 0,
        codeOwnerReview: reviews?.require_code_owner_reviews ?? false,
        unsupported,
        statusChecks: checks
          ? [
              ...new Set([
                ...(checks.contexts ?? []),
                ...(checks.checks ?? []).map((c) => c.context),
              ]),
            ]
          : [],
        enforceAdmins: r.data.enforce_admins?.enabled ?? false,
      };
    }
    // GitHub answers 404 "Branch not protected" when no classic rule exists. Any other 403 or 404
    // means the token cannot see the rule, which is not the same as there being none.
    if (r.status === 404 && /branch not protected/i.test(r.message))
      return { state: "none" };
    return { state: "cannot-read", detail: `HTTP ${r.status ?? "?"}: ${r.message}` };
  });
}

// Active rulesets that apply to the branch: { state: "rules" | "none" | "cannot-read", ... }.
function rulesets() {
  return remember("rulesets", () => {
    const t = target();
    const branch = branchName();
    if (t.reason || !branch)
      return { state: "cannot-read", detail: t.reason ?? "no base branch" };
    const r = ghApi(`${repoPath(t)}/rules/branches/${encodeURIComponent(branch)}`, [
      "--paginate", "--slurp",
    ]);
    if (!Array.isArray(r.data) || r.data.length === 0 || !r.data.every(Array.isArray))
      return { state: "cannot-read", detail: `HTTP ${r.status ?? "?"}: ${r.message}` };
    const rules = r.data.flat();
    if (rules.length === 0) return { state: "none" };
    const approvals = [];
    const unsupported = [];
    const checks = [];
    let queue = false;
    let codeOwnerReview = false;
    let methods = null;
    for (const rule of rules) {
      const p = rule.parameters ?? {};
      if (rule.type === "pull_request") {
        approvals.push(p.required_approving_review_count ?? 0);
        unsupported.push(...unsupportedReviewFields(p, RULESET_REVIEW_FIELDS, "pull_request"));
        codeOwnerReview ||= p.require_code_owner_review ?? false;
        if (p.allowed_merge_methods)
          methods = methods === null
            ? p.allowed_merge_methods
            : methods.filter((method) => p.allowed_merge_methods.includes(method));
      }
      if (rule.type === "required_status_checks")
        for (const c of p.required_status_checks ?? []) checks.push(c.context);
      if (rule.type === "merge_queue") queue = true;
    }
    return {
      state: "rules",
      ruleTypes: [...new Set(rules.map((rule) => rule.type))].sort(),
      approvals: approvals.length ? Math.max(...approvals) : 0,
      codeOwnerReview,
      unsupported,
      statusChecks: [...new Set(checks)],
      mergeQueue: queue,
      allowedMergeMethods: methods,
    };
  });
}

// Merge queue through GraphQL, which sees queues set up through either mechanism.
function mergeQueueGraphql() {
  const t = target();
  const branch = branchName();
  if (t.reason || !branch) return null;
  const r = ghApi("graphql", [
    "-f",
    "query=query($o:String!,$r:String!,$b:String!){repository(owner:$o,name:$r){mergeQueue(branch:$b){id}}}",
    "-F",
    `o=${t.owner}`,
    "-F",
    `r=${t.repo}`,
    "-F",
    `b=${branch}`,
  ]);
  const repo = r.data?.data?.repository;
  if (r.data?.errors?.length || !repo || !Object.hasOwn(repo, "mergeQueue")) return null;
  return repo.mergeQueue !== null;
}

function mergeRequirements() {
  const t = target();
  const { name: branch, source: branchSource } = mergeBase().value ?? {};
  if (t.reason || !branch)
    return { ...no(t.reason ?? "cannot determine base branch"), branch: branch ?? null };
  const classic = classicProtection();
  const sets = rulesets();
  const queue = mergeQueueGraphql();
  const unreadable = [];
  if (branchSource.startsWith("local ")) unreadable.push("default branch from GitHub");
  if (classic.state === "cannot-read")
    unreadable.push(`branch protection (${classic.detail})`);
  if (sets.state === "cannot-read") unreadable.push(`rulesets (${sets.detail})`);
  if (queue === null) unreadable.push("merge queue (graphql)");
  if (classic.state === "cannot-read" && sets.state === "cannot-read")
    return { ...no(`cannot read the rules: ${unreadable.join("; ")}`), branch, branchSource };

  const readable = [classic, sets].filter((s) => s.state !== "cannot-read");
  const approvals = Math.max(0, ...readable.map((s) => s.approvals ?? 0));
  const unsupported = [...new Set(readable.flatMap((s) => s.unsupported ?? []))].sort();
  const complete = unreadable.length === 0 && unsupported.length === 0;
  return ok({
    branch,
    branchSource,
    // Never read this as "no approval needed" unless `complete` is true and the number is 0.
    requiredApprovals: { atLeast: approvals, exact: complete },
    requiredStatusChecks: [
      ...new Set([...(classic.statusChecks ?? []), ...(sets.statusChecks ?? [])]),
    ],
    requireCodeOwnerReview:
      Boolean(classic.codeOwnerReview) || Boolean(sets.codeOwnerReview),
    mergeQueue: queue ?? (sets.mergeQueue ? true : null),
    sources: { branchProtection: classic, rulesets: sets },
    complete,
    unreadable,
    unsupported,
  });
}

function mergeMethods() {
  const info = repoInfo();
  if (!info.data) return no(`cannot read repository settings: ${info.message}`);
  const d = info.data;
  if (
    d.allow_merge_commit === undefined &&
    d.allow_squash_merge === undefined &&
    d.allow_rebase_merge === undefined
  )
    return no(
      "cannot read: GitHub shows the merge method settings only to accounts with push access",
    );
  const allowed = [
    d.allow_merge_commit && "merge",
    d.allow_squash_merge && "squash",
    d.allow_rebase_merge && "rebase",
  ].filter(Boolean);
  const sets = rulesets();
  return ok({
    allowed,
    rulesetRestriction: sets.allowedMergeMethods ?? null,
    autoMerge: d.allow_auto_merge ?? null,
    deleteBranchOnMerge: d.delete_branch_on_merge ?? null,
    viewerPermissions: d.permissions ?? null,
  });
}

// --- files -------------------------------------------------------------------------------

function repoRoot() {
  const repo = gitRepo();
  return repo.ok ? repo.value.root : cwd;
}

// Case-insensitive lookup of a repo-relative path, so PULL_REQUEST_TEMPLATE.md matches too.
function findPath(root, candidates) {
  for (const candidate of candidates) {
    let dir = root;
    for (const part of candidate.split("/")) {
      let entries = [];
      try {
        entries = readdirSync(dir);
      } catch {}
      const hit = entries.find((e) => e.toLowerCase() === part.toLowerCase());
      if (!hit) {
        dir = null;
        break;
      }
      dir = join(dir, hit);
    }
    if (dir) return dir.slice(root.length + 1);
  }
  return null;
}

const fileProbe = (candidates) => () => {
  const hit = findPath(repoRoot(), candidates);
  return hit ? ok(hit) : no("not found");
};

// --- tools -------------------------------------------------------------------------------

function tool(command, args = ["-version"]) {
  const r = run(command, args);
  if (r.missing) return no("not found on PATH");
  if (r.status !== 0) return no(`${command} ${args[0]} exited with ${r.status}`);
  return ok((r.stdout || r.stderr).split("\n")[0]);
}

function agentBrowser() {
  const onPath = tool("agent-browser", ["--version"]);
  if (onPath.ok) return onPath;
  const local = join(cwd, "node_modules", ".bin", "agent-browser");
  if (existsSync(local)) return ok(`${local} (local install)`);
  return no("not found on PATH or in node_modules/.bin");
}

function playwright(packages) {
  const require = createRequire(join(cwd, "package.json"));
  for (const name of packages) {
    try {
      require.resolve(name);
      let version = null;
      try {
        const file = require.resolve(`${name}/package.json`);
        version = JSON.parse(readFileSync(file, "utf8")).version ?? null;
      } catch {}
      return ok({ package: name, version });
    } catch {}
  }
  return no(`${packages.join(" or ")} not resolvable from ${cwd}`);
}

// --- harness hints -----------------------------------------------------------------------

// Names of environment variables only, never values. A hint is not proof of the harness: the
// agent's own tool list decides.
function harnessHints() {
  const prefixes = {
    "claude-code": ["CLAUDECODE", "CLAUDE_CODE_", "CLAUDE_PROJECT_DIR"],
    codex: ["CODEX_"],
    "t3-code": ["T3CODE_", "T3_"],
    cursor: ["CURSOR_"],
    orca: ["ORCA_"],
    gemini: ["GEMINI_CLI"],
  };
  const names = Object.keys(process.env);
  const hints = {};
  for (const [harness, list] of Object.entries(prefixes)) {
    const hit = names.filter((n) => list.some((p) => n === p || n.startsWith(p)));
    if (hit.length) hints[harness] = hit.sort();
  }
  return Object.keys(hints).length
    ? ok({ note: "hints only, not proof", environmentVariableNames: hints })
    : no("no known harness variable is set");
}

// --- main --------------------------------------------------------------------------------

function main() {
  const probes = {
    gitRepo: probe(gitRepo),
    gitRemote: probe(gitRemote),
    defaultBranch: probe(defaultBranch),
    ghInstalled: probe(ghInstalled),
    ghAuthenticated: probe(ghAuth),
    mergeRequirements: probe(mergeRequirements),
    mergeMethods: probe(mergeMethods),
    codeowners: probe(
      fileProbe(["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]),
    ),
    prTemplate: probe(
      fileProbe([
        ".github/pull_request_template.md",
        "pull_request_template.md",
        "docs/pull_request_template.md",
        ".github/PULL_REQUEST_TEMPLATE",
      ]),
    ),
    agentsMd: probe(fileProbe(["AGENTS.md"])),
    ffmpeg: probe(() => tool("ffmpeg")),
    ffprobe: probe(() => tool("ffprobe")),
    magick: probe(() => tool("magick")),
    // Keep this list aligned with review-evidence/scripts/browser.mjs.
    playwright: probe(() => playwright(["playwright", "@playwright/test"])),
    playwrightCore: probe(() => playwright(["playwright-core"])),
    agentBrowser: probe(agentBrowser),
    harnessHints: probe(harnessHints),
  };
  return {
    script: "discover.mjs",
    cwd,
    node: process.version,
    note: "Read-only. The model list, subagent tool and browser tools are not visible here: read them from your own tool list.",
    probes,
  };
}

let output;
try {
  const { values } = parseArgs({ options: { base: { type: "string" } } });
  if (values.base !== undefined && !values.base.trim()) throw new Error("--base needs a branch name");
  requestedBase = values.base;
  output = main();
} catch (error) {
  output = { script: "discover.mjs", cwd, error: String(error?.message ?? error), probes: {} };
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = 0;
