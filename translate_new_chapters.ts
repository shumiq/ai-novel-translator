import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { Logger } from "./utils/logger";

const BRANCH_PREFIX = "web/*";
const LOCK_PATH = ".git/index.lock";
const REBASE_MERGE_PATH = ".git/rebase-merge";
const SELF_SCRIPT = "translate_new_chapters.ts";

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

async function getLastCommitMessage(branch: string): Promise<string> {
  return execShell(`git log -1 --pretty=%B "${branch}"`);
}

async function hasChanges(): Promise<boolean> {
  const out = await execShell("git status --porcelain");
  return out.length > 0;
}

async function main(): Promise<void> {
  const branches = getBranches(BRANCH_PREFIX);

  if (branches.length === 0) {
    Logger.info("No web/* branches found.");
    return;
  }

  Logger.info(`Found ${branches.length} web/* branches to check.`);

  await execShell("git checkout main -f");

  let processedCount = 0;

  for (const branch of branches) {
    cleanGitState();

    Logger.info(`Checking branch ${branch}...`);
    await execShell(`git checkout ${branch} -f`);
    cleanGitState();

    const lastMsg = await getLastCommitMessage(branch);

    if (lastMsg !== "wip") {
      Logger.info(`Skip branch ${branch} (latest commit is not "wip").`);
      cleanGitState();
      continue;
    }

    Logger.info(
      `Branch ${branch} has "wip" commit. Running translation pipeline...`,
    );
    processedCount++;

    try {
      execSync("bun start", { encoding: "utf-8", stdio: "inherit" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Logger.error(`Translation pipeline failed for branch ${branch}: ${msg}`);
      cleanGitState();
      continue;
    }

    Logger.info(
      `Translation complete for ${branch}. Squashing changes into "start" commit...`,
    );

    // Undo the wip commit but keep its changes staged
    await execShell("git reset --soft HEAD~1");

    // Stage all changes except this script
    await execShell(`git add --all -- ":!${SELF_SCRIPT}"`);

    // Amend the parent (start) commit with all staged changes
    await execShell("git commit --amend --no-edit");

    Logger.info(
      `Squashed translation changes into "start" commit on ${branch}.`,
    );
    cleanGitState();
  }

  await execShell("git checkout main -f");

  if (processedCount === 0) {
    Logger.info("No branches had a 'wip' commit. Nothing to translate.");
  } else {
    Logger.info(`Finished processing ${processedCount} branch(es).`);
  }
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
