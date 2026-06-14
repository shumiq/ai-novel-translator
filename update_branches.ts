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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanGitState(): void {
  try {
    if (existsSync(LOCK_PATH)) {
      rmSync(LOCK_PATH, { force: true });
      Logger.warn("Removed stale index.lock");
    }
  } catch {
    /* ignore */
  }

  try {
    if (existsSync(REBASE_MERGE_PATH)) {
      execSync("git rebase --abort", {
        encoding: "utf-8",
        stdio: "pipe",
      });
      Logger.warn("Aborted stale rebase");
    }
  } catch {
    try {
      if (existsSync(REBASE_MERGE_PATH)) {
        rmSync(REBASE_MERGE_PATH, { recursive: true, force: true });
        Logger.warn("Force-removed stale rebase-merge directory");
      }
    } catch {
      /* ignore */
    }
  }
}

async function execShell(
  command: string,
  options?: Parameters<typeof execSync>[1],
): Promise<string> {
  const defaulted = { encoding: "utf-8" as BufferEncoding, ...options };
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return execSync(command, defaulted).toString().trim();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      Logger.warn(
        `Retrying git command (attempt ${attempt + 1}/${maxAttempts})...`,
      );
      cleanGitState();
      await sleep(1000);
    }
  }
  throw new Error("Unreachable");
}

async function intFromShell(command: string): Promise<number> {
  return parseInt(await execShell(command), 10);
}

async function isBehindMain(branch: string): Promise<boolean> {
  return (await intFromShell(`git rev-list --count "${branch}..main"`)) > 0;
}

async function isCommitterDateOlderThan24h(branch: string): Promise<boolean> {
  const committerTs = await intFromShell(`git log -1 --format=%ct "${branch}"`);
  return Math.floor(Date.now() / 1000) - committerTs > 86400;
}

async function needsUpdate(branch: string): Promise<boolean> {
  if (branch.startsWith("epub/")) return isBehindMain(branch);
  return (
    (await isBehindMain(branch)) || (await isCommitterDateOlderThan24h(branch))
  );
}

async function hasChanges(): Promise<boolean> {
  const out = await execShell("git status --porcelain");
  return out.length > 0;
}

async function processBranch(branch: string): Promise<void> {
  cleanGitState();

  if (!(await needsUpdate(branch))) {
    Logger.info(`Skip branch ${branch} (up-to-date and recent commit).`);
    return;
  }

  Logger.info(`Rebase branch ${branch}...`);
  await execShell(`git checkout ${branch} -f`);
  cleanGitState();
  await execShell("git rebase main");

  if (!branch.startsWith("web/")) {
    cleanGitState();
    return;
  }

  Logger.info(`Fetch new chapters for branch ${branch}...`);
  await execShell("bun prepare.ts");
  rmSync(".temp", { recursive: true, force: true });

  if (!(await hasChanges())) {
    cleanGitState();
    return;
  }

  Logger.info(`Committing changes for branch ${branch}...`);
  await execShell('git add --all -- ":!update_branches.ts" ":!.temp"');

  if (!(await hasChanges())) {
    cleanGitState();
    return;
  }

  const lastCommitMessage = await execShell("git log -1 --pretty=%B");
  if (lastCommitMessage === "wip") {
    await execShell("git commit --amend --no-edit");
  } else {
    await execShell('git commit -m "wip"');
  }

  cleanGitState();
}

async function main(): Promise<void> {
  const allBranches = BRANCH_PREFIXES.flatMap(getBranches);

  await execShell("git checkout main -f");

  for (const branch of allBranches) {
    try {
      await processBranch(branch);
    } catch (raw) {
      const message = raw instanceof Error ? raw.message : String(raw);
      Logger.error(`Failed to process branch ${branch}: ${message}`);
      cleanGitState();
      await execShell("git rebase --abort").catch(() => {});
      await execShell("git checkout main -f").catch(() => {});
    }
  }

  await execShell("git checkout main -f");
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
