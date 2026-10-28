// Name: Update Branches
// Description: Rebase git branches and fetch new web chapters from upstream
import { existsSync, readdirSync, rmSync } from "fs";
import { basename } from "path";
import {
  cleanGitState,
  execShell,
  getBranches,
  hasChanges,
  intFromShell,
} from "../utils/git";
import { Logger } from "../utils/logger";

const BRANCH_PREFIXES = ["web/*", "epub/*"] as const;

async function isBehindMain(branch: string): Promise<boolean> {
  return (await intFromShell(`git rev-list --count "${branch}..main"`)) > 0;
}

// Read from the object DB, so each branch's paths are known without checkout.
async function getBranchConfig(
  branch: string,
): Promise<{ originalPath: string; outputPath: string }> {
  const cfg = await execShell(`git show "${branch}:config.ts"`);
  const pick = (key: string) =>
    new RegExp(`${key}:\\s*"([^"]*)"`).exec(cfg)?.[1] ?? "";
  return { originalPath: pick("originalPath"), outputPath: pick("outputPath") };
}

function jsonNames(dir: string): string[] | null {
  if (!dir || !existsSync(dir)) return null;
  return readdirSync(dir).filter((f) => f.endsWith(".json"));
}

// Mirrors prepare.ts: copies any source *.json missing from ./json.
async function hasNewChapters(branch: string): Promise<boolean> {
  const { originalPath, outputPath } = await getBranchConfig(branch);
  const sources = jsonNames(originalPath);
  const outputs = jsonNames(outputPath);

  // Unreadable source dir – cannot rule out new chapters, so fail open.
  if (!sources && !outputs) return true;

  const committed = new Set(
    (await execShell(`git ls-tree -r --name-only "${branch}" -- json`))
      .split("\n")
      .map((f) => basename(f)),
  );

  return [...(sources ?? []), ...(outputs ?? [])].some(
    (name) => !committed.has(name),
  );
}

async function rebaseBranch(branch: string): Promise<void> {
  cleanGitState();
  Logger.info(`Rebase branch ${branch}...`);
  await execShell(`git checkout ${branch} -f`);
  cleanGitState();
  try {
    await execShell("git rebase main");
  } catch (raw) {
    await execShell("git rebase --abort").catch(() => {});
    throw raw;
  }
  cleanGitState();
}

async function processBranch(branch: string): Promise<void> {
  cleanGitState();

  if (!branch.startsWith("web/")) {
    Logger.info(`Skip branch ${branch} (not a web branch).`);
    return;
  }

  if (!(await hasNewChapters(branch))) {
    Logger.info(`Skip branch ${branch} (up-to-date, no new chapters).`);
    return;
  }

  Logger.info(`Fetch new chapters for branch ${branch}...`);
  await execShell(`git checkout ${branch} -f`);
  cleanGitState();
  await execShell("bun tools/prepare.ts");
  rmSync(".temp", { recursive: true, force: true });

  if (!(await hasChanges())) {
    Logger.info(`  └─ no new chapters to commit`);
    cleanGitState();
    return;
  }

  Logger.info(`Committing changes for branch ${branch}...`);
  await execShell('git add --all -- ":!tools/update_branches.ts" ":!.temp"');

  if (!(await hasChanges())) {
    Logger.info(`  └─ nothing staged, skipping commit`);
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
  Logger.info(`Found ${allBranches.length} branches to check`);

  await execShell("git checkout main -f");

  Logger.info("Rebasing all branches...");
  for (const branch of allBranches) {
    try {
      if (await isBehindMain(branch)) {
        await rebaseBranch(branch);
      } else {
        Logger.info(`Skip rebase for ${branch} (up-to-date with main).`);
      }
    } catch (raw) {
      const message = raw instanceof Error ? raw.message : String(raw);
      Logger.error(`Failed to rebase branch ${branch}: ${message}`);
      cleanGitState();
      await execShell("git rebase --abort").catch(() => {});
      await execShell("git checkout main -f").catch(() => {});
    }
  }

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
  Logger.done("Branch update complete");
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
