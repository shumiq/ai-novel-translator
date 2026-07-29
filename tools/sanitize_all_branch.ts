// Name: Sanitize All (Branch)
// Description: Sanitize translated HTML files across all git web/* branches
import { rmSync } from "fs";
import {
  cleanGitState,
  execShell,
  getBranches,
  hasChanges,
} from "../utils/git";
import { Logger } from "../utils/logger";

const BRANCH_PREFIX = "web/*";
const SELF_SCRIPT = "sanitize_all_branch.ts";

async function main(): Promise<void> {
  const branches = getBranches(BRANCH_PREFIX);

  if (branches.length === 0) {
    Logger.info("No web/* branches found.");
    return;
  }

  Logger.info(`Found ${branches.length} web/* branches to sanitize.`);

  await execShell("git checkout main -f");

  let processedCount = 0;

  for (const branch of branches) {
    cleanGitState();

    Logger.info(`Checking branch ${branch}...`);
    await execShell(`git checkout ${branch} -f`);
    cleanGitState();

    Logger.info(`Sanitizing files on branch ${branch}...`);
    await execShell("bun tools/sanitize_all.ts");

    rmSync(".temp", { recursive: true, force: true });

    if (!(await hasChanges())) {
      Logger.info(`No changes to commit for ${branch}.`);
      cleanGitState();
      continue;
    }

    processedCount++;

    Logger.info(`Staging changes for branch ${branch}...`);
    await execShell(`git add --all -- ":!${SELF_SCRIPT}" ":!.temp"`);

    if (!(await hasChanges())) {
      Logger.info(`Nothing staged for ${branch} after filtering.`);
      cleanGitState();
      continue;
    }

    Logger.info(`Amending last commit on ${branch}...`);
    await execShell("git commit --amend --no-edit");

    cleanGitState();
  }

  await execShell("git checkout main -f");

  if (processedCount === 0) {
    Logger.info("No branches had files to sanitize.");
  } else {
    Logger.info(`Sanitized and amended ${processedCount} branch(es).`);
  }
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
