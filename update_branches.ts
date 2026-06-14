import { rmSync } from "fs";
import {
  cleanGitState,
  execShell,
  getBranches,
  hasChanges,
  hasStagedChanges,
  intFromShell,
} from "./utils/git";
import { Logger } from "./utils/logger";

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

async function main(): Promise<void> {
  const allBranches = BRANCH_PREFIXES.flatMap(getBranches);

  await execShell("git checkout main -f");

  for (const branch of allBranches) {
    cleanGitState();

    if (!(await needsUpdate(branch))) {
      Logger.info(`Skip branch ${branch} (up-to-date and recent commit).`);
      continue;
    }

    Logger.info(`Rebase branch ${branch}...`);
    await execShell(`git checkout ${branch} -f`);
    cleanGitState();
    await execShell("git rebase main");

    if (!branch.startsWith("web/")) {
      cleanGitState();
      continue;
    }

    Logger.info(`Fetch new chapters for branch ${branch}...`);
    await execShell("bun prepare.ts");
    rmSync(".temp", { recursive: true, force: true });

    if (!(await hasChanges())) {
      cleanGitState();
      continue;
    }

    Logger.info(`Committing changes for branch ${branch}...`);
    await execShell("git rm --cached -r --ignore-unmatch .temp");
    await execShell('git add --all -- ":!update_branches.ts" ":!.temp"');

    if (!(await hasStagedChanges())) {
      cleanGitState();
      continue;
    }

    const lastCommitMessage = await execShell("git log -1 --pretty=%B");
    if (lastCommitMessage === "wip") {
      await execShell("git commit --amend --no-edit");
    } else {
      await execShell('git commit -m "wip"');
    }

    cleanGitState();
  }

  await execShell("git checkout main -f");
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
