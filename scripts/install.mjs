#!/usr/bin/env node
// Copies skill folders from this repo into another repo, so its agents share the same workflows.
//
//   pnpm skills:install --target <dir> (--collections a,b and/or --skills x,y | --all)
//                       [--dest agents|claude|codex] [--dry-run] [--force]
//
// --collections and --skills are added together. Use --all to install every skill.
// --dest picks <target>/.agents/skills (default), <target>/.claude/skills or <target>/.codex/skills.
//
// A destination skill folder that differs from this repo is never overwritten without --force, and
// nothing is written at all when any folder would be refused. Running it twice changes nothing.
// A manifest, <target>/<.agents|.claude|.codex>/agent-toolbox.json, records what was installed and
// from which commit of this repo. It lives next to the skills folder, not inside it.
//
// pstack skills link relatively to `../../docs/harness/claude-code.md` and name agents in
// `.agents/agents/`. When pstack is selected, the docs file is copied next to the skills folder
// (<dest dir>/docs/harness/). The agents folder is copied only with --dest agents: in
// .claude/agents Claude Code would register the files as project agents, and what Codex does with
// .codex/agents for Claude Code format files is not verified.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  filesAt,
  hashFile,
  hashSkillDir,
  ownership,
  ROOT,
  readLock,
  readManifest,
  SKILLS_DIR,
} from "./skills/lib.mjs";

const DEST_DIRS = { agents: ".agents", claude: ".claude", codex: ".codex" };
const MANIFEST_NAME = "agent-toolbox.json";

function fail(message) {
  console.error(`install: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { dest: "agents", dryRun: false, force: false };
  const takesValue = new Set(["target", "collections", "skills", "dest"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--all") options.all = true;
    else if (arg.startsWith("--") && takesValue.has(arg.slice(2))) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--"))
        fail(`${arg} needs a value`);
      options[arg.slice(2)] = value;
      i += 1;
    } else fail(`unknown argument "${arg}"`);
  }
  return options;
}

const list = (value) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const options = parseArgs(process.argv.slice(2));
if (!Object.hasOwn(DEST_DIRS, options.dest))
  fail(`--dest must be one of ${Object.keys(DEST_DIRS).join(", ")}`);
const wantedCollections = list(options.collections);
const wantedSkills = list(options.skills);
if (options.collections !== undefined && !wantedCollections.length)
  fail("--collections must name at least one collection");
if (options.skills !== undefined && !wantedSkills.length)
  fail("--skills must name at least one skill");
if (!options.all && !wantedCollections.length && !wantedSkills.length)
  fail("Usage: pnpm skills:install --target <dir> with --collections a,b, --skills x,y, or --all");
if (options.all && (wantedCollections.length || wantedSkills.length))
  fail("--all cannot be combined with --collections or --skills");
if (!options.target) fail("--target <dir> is required");

let target = resolve(options.target);
if (!existsSync(target) || !statSync(target).isDirectory())
  fail(`target ${target} is not a directory`);
target = realpathSync(target);
if (target === realpathSync(ROOT)) fail("the target is this repo itself");

const manifest = readManifest();
const { owners } = ownership(manifest, readLock());
const allSkills = [...owners.keys()].sort();

// Which skills.
for (const id of wantedCollections)
  if (!manifest.some((c) => c.id === id))
    fail(
      `unknown collection "${id}". Known: ${manifest.map((c) => c.id).join(", ")}`,
    );
for (const name of wantedSkills)
  if (!owners.has(name)) fail(`unknown skill "${name}"`);
const selected = allSkills.filter(
  (name) =>
    options.all ||
    wantedSkills.includes(name) ||
    wantedCollections.includes(owners.get(name).id),
);
for (const name of selected)
  if (!existsSync(join(SKILLS_DIR, name, "SKILL.md")))
    fail(`.agents/skills/${name} is missing in this repo. Run: pnpm skills:sync`);

// Check from the target outward before inspecting or writing any destination entry.
function destinationEntry(path, type) {
  const parent = dirname(path);
  if (parent !== target && !destinationEntry(parent, "directory")) return undefined;
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry?.isSymbolicLink()) fail(`refusing destination symlink at ${path}`);
  if (entry && !(type === "directory" ? entry.isDirectory() : entry.isFile()))
    fail(`destination ${path} must be a ${type}`);
  return entry;
}

// Where things go.
const destDir = join(target, DEST_DIRS[options.dest]);
const skillsDest = join(destDir, "skills");
const manifestPath = join(destDir, MANIFEST_NAME);
const previous = destinationEntry(manifestPath, "file")
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { installed: {}, extras: {} };

// Plan. Each entry is one folder or file and what would happen to it.
const plan = [];

for (const name of selected) {
  const from = join(SKILLS_DIR, name);
  const to = join(skillsDest, name);
  const sourceHash = hashSkillDir(from);
  let action = "new";
  if (destinationEntry(to, "directory")) {
    const current = hashSkillDir(to);
    if (current === sourceHash) action = "unchanged";
    else if (options.force) action = "overwrite";
    else
      action =
        current === previous.installed?.[name]?.sha256
          ? "refused (outdated copy of an earlier install)"
          : "refused (modified here)";
  }
  plan.push({
    kind: "skill",
    name,
    from,
    to,
    action,
    sha256: sourceHash,
    collection: owners.get(name).id,
  });
}

// Extras of the selected collections (pstack: docs and agents).
const extrasInstalled = {};
const extraNotes = [];
for (const collection of manifest) {
  const used = selected.some((name) => owners.get(name).id === collection.id);
  if (!used) continue;
  for (const extra of collection.extras ?? []) {
    if (extra.to.startsWith(".agents/agents") && options.dest !== "agents") {
      extraNotes.push(
        `${extra.to} not copied: with --dest ${options.dest} it would land in ${DEST_DIRS[options.dest]}/agents. Use --dest agents to copy it.`,
      );
      continue;
    }
    for (const file of filesAt(ROOT, extra.to)) {
      const fileRel = file.slice(".agents/".length);
      const from = join(ROOT, file);
      const to = join(destDir, fileRel);
      const sourceHash = hashFile(from);
      let action = "new";
      if (destinationEntry(to, "file")) {
        if (hashFile(to) === sourceHash) action = "unchanged";
        else action = options.force ? "overwrite" : "refused (modified here)";
      }
      plan.push({
        kind: "extra",
        name: `${DEST_DIRS[options.dest]}/${fileRel}`,
        from,
        to,
        action,
        sha256: sourceHash,
        collection: collection.id,
      });
      extrasInstalled[`${DEST_DIRS[options.dest]}/${fileRel}`] = sourceHash;
    }
  }
}

// Report the plan.
const refused = plan.filter((p) => p.action.startsWith("refused"));
for (const p of plan)
  console.log(
    `install: ${p.action.padEnd(9)} ${p.kind === "skill" ? `${p.name} (${p.collection})` : p.name}`,
  );
for (const note of extraNotes) console.log(`install: note: ${note}`);

if (refused.length) {
  console.error(
    `install: ${refused.length} item(s) differ from this repo and nothing was written. Review them, or run again with --force to overwrite.`,
  );
  process.exit(1);
}

const changes = plan.filter((p) => p.action !== "unchanged");

// Next manifest: previous entries for skills not in this run stay.
function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
const nextManifest = {
  tool: "agent-toolbox",
  commit: gitCommit(),
  dest: options.dest,
  installed: { ...previous.installed },
  extras: { ...previous.extras, ...extrasInstalled },
};
for (const p of plan.filter((q) => q.kind === "skill"))
  nextManifest.installed[p.name] = { collection: p.collection, sha256: p.sha256 };
nextManifest.installed = Object.fromEntries(
  Object.entries(nextManifest.installed).sort(([a], [b]) => a.localeCompare(b)),
);
nextManifest.extras = Object.fromEntries(
  Object.entries(nextManifest.extras).sort(([a], [b]) => a.localeCompare(b)),
);
const manifestText = `${JSON.stringify(nextManifest, null, 2)}\n`;
const manifestChanged =
  !existsSync(manifestPath) || readFileSync(manifestPath, "utf8") !== manifestText;

if (options.dryRun) {
  console.log(
    `install: dry run, ${changes.length} change(s) planned, manifest ${manifestChanged ? "would be written" : "unchanged"}, nothing written (${DEST_DIRS[options.dest]}/skills in ${target})`,
  );
  process.exit(0);
}

const skipJunk = (source) => !source.endsWith(".DS_Store");

function installSkill({ from, to, action }) {
  const staging = mkdtempSync(join(dirname(to), `.${basename(to)}-`));
  const replacement = join(staging, "new");
  const backup = join(staging, "old");
  let keepBackup = false;
  try {
    cpSync(from, replacement, { recursive: true, filter: skipJunk });
    if (action === "overwrite") renameSync(to, backup);
    try {
      renameSync(replacement, to);
    } catch (error) {
      if (action === "overwrite") {
        try {
          renameSync(backup, to);
        } catch (restoreError) {
          keepBackup = true;
          throw new AggregateError([error, restoreError], `Could not restore ${to}; old copy is at ${backup}`);
        }
      }
      throw error;
    }
  } finally {
    if (!keepBackup) rmSync(staging, { recursive: true, force: true });
  }
}

for (const p of changes) {
  destinationEntry(p.to, p.kind === "skill" ? "directory" : "file");
  mkdirSync(dirname(p.to), { recursive: true });
  if (p.kind === "skill") installSkill(p);
  else cpSync(p.from, p.to);
}
if (manifestChanged) {
  destinationEntry(manifestPath, "file");
  mkdirSync(destDir, { recursive: true });
  writeFileSync(manifestPath, manifestText);
}
console.log(
  `install: done, ${changes.length} changed, ${plan.length - changes.length} unchanged, manifest ${manifestChanged ? "written" : "unchanged"} (${DEST_DIRS[options.dest]}/skills in ${target})`,
);
