import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { Logger } from "./utils/logger";

const BRANCH_PREFIXES = ["web/*", "epub/*"] as const;
const LOCK_PATH = ".git/index.lock";
const REBASE_MERGE_PATH = ".git/rebase-merge";

function getBranches(pattern: string): string[] {
  return execSync(`git branch --list "${pattern}"`, { encoding: "utf-8" })
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b);
}

function cleanGitState(): void {
  try {
    if (existsSync(LOCK_PATH)) {
      rmSync(LOCK_PATH, { force: true });
      Logger.warn("Removed stale index.lock");
    }
  } catch { /* ignore */ }

  try {
    if (existsSync(REBASE_MERGE_PATH)) {
      execSync("git rebase --abort", {
        encoding: "utf-8",
        stdio: "pipe",
      });
      Logger.warn("Aborted stale rebase");
    }
  } catch { /* ignore */ }
}

function execShell(command: string, options?: Parameters<typeof execSync>[1]): string {
  const defaulted = { encoding: "utf-8" as BufferEncoding, ...options };
  try {
    return execSync(command, defaulted).toString().trim();
  } catch (err) {
    cleanGitState();
    return execSync(command, defaulted).toString().trim();
  }
}

function intFromShell(command: string): number {
  return parseInt(execShell(command), 10);
}

function isBehindMain(branch: string): boolean {
  return intFromShell(`git rev-list --count "${branch}..main"`) > 0;
}

function isCommitterDateOlderThan24h(branch: string): boolean {
  const committerTs = intFromShell(`git log -1 --format=%ct "${branch}"`);
  return Math.floor(Date.now() / 1000) - committerTs > 86400;
}

function needsUpdate(branch: string): boolean {
  if (branch.startsWith("epub/")) return isBehindMain(branch);
  return isBehindMain(branch) || isCommitterDateOlderThan24h(branch);
}

function hasChanges(): boolean {
  const out = execShell("git status --porcelain");
  return out.length > 0;
}

const allBranches = BRANCH_PREFIXES.flatMap(getBranches);

execShell("git checkout main -f");

for (const branch of allBranches) {
  cleanGitState();

  if (!needsUpdate(branch)) {
    Logger.info(`Skip branch ${branch} (up-to-date and recent commit).`);
    continue;
  }

  Logger.info(`Rebase branch ${branch}...`);
  execShell(`git checkout ${branch} -f`);
  execShell(`git rebase main`);

  if (branch.startsWith("web/")) {
    Logger.info(`Fetch new chapters for branch ${branch}...`);
    execShell("bun prepare.ts");

    if (!hasChanges()) continue;

    Logger.info(`Committing changes for branch ${branch}...`);
    execShell("git add .");

    if (!hasChanges()) continue;

    const lastCommitMessage = execShell("git log -1 --pretty=%B");
    if (lastCommitMessage === "wip") {
      execShell("git commit --amend --no-edit");
    } else {
      execShell('git commit -m "wip"');
    }
  }
}

execShell("git checkout main -f");
