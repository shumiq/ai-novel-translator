import { execSync } from "child_process";
import { Logger } from "./utils/logger";
import {
  getBranches,
  cleanGitState,
  execShell,
  hasStagedChanges,
  getLastCommitMessage,
} from "./utils/git";

const BRANCH_PREFIX = "web/*";
const SELF_SCRIPT = "translate_new_chapters.ts";

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

    await execShell("git reset --soft HEAD~1");

    await execShell('git rm --cached -r --ignore-unmatch .temp');
    await execShell(`git add --all -- ":!${SELF_SCRIPT}" ":!.temp"`);

    if (!(await hasStagedChanges())) {
      Logger.info(`No new content to commit for ${branch}.`);
      cleanGitState();
      continue;
    }

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
