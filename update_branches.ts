import { execSync } from "child_process";
import { rmSync } from "fs";
import { Logger } from "./utils/logger";
import {
  getBranches,
  cleanGitState,
  execShell,
  hasChanges,
  intFromShell,
} from "./utils/git";

const BRANCH_PREFIXES = ["web/*", "epub/*"] as const;

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
