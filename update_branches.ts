import { execSync } from "child_process";
import { Logger } from "./utils/logger";

const BRANCH_PREFIXES = ["web/*", "epub/*"] as const;

function getBranches(pattern: string): string[] {
  return execSync(`git branch --list "${pattern}"`, { encoding: "utf-8" })
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b);
}

function isBehindMain(branch: string): boolean {
  const count = execSync(
    `git rev-list --count "${branch}..main"`,
    { encoding: "utf-8" },
  ).trim();
  return parseInt(count, 10) > 0;
}

function isCommitterDateOlderThan24h(branch: string): boolean {
  const committerTs = parseInt(
    execSync(`git log -1 --format=%ct "${branch}"`, { encoding: "utf-8" }).trim(),
    10,
  );
  return Math.floor(Date.now() / 1000) - committerTs > 86400;
}

function needsUpdate(branch: string): boolean {
  if (branch.startsWith("epub/")) return isBehindMain(branch);
  return isBehindMain(branch) || isCommitterDateOlderThan24h(branch);
}

const allBranches = BRANCH_PREFIXES.flatMap(getBranches);

execSync(`git checkout main -f`);

for (const branch of allBranches) {
  if (!needsUpdate(branch)) {
    Logger.info(`Skip branch ${branch} (up-to-date and recent commit).`);
    continue;
  }

  Logger.info(`Rebase branch ${branch}...`);
  execSync(`git checkout ${branch} -f`);
  execSync(`git rebase main`);

  if (branch.startsWith("web/")) {
    Logger.info(`Fetch new chapters for branch ${branch}...`);
    execSync(`bun prepare.ts`);
    const changes = execSync(`git status --porcelain`, { encoding: "utf-8" })
      .trim()
      .split("\n")
      .filter((line) => line);
    if (changes.length > 0) {
      Logger.info(
        `Committing ${changes.length} changes for branch ${branch}...`,
      );
      execSync(`git add .`);
      const lastCommitMessage = execSync(`git log -1 --pretty=%B`, {
        encoding: "utf-8",
      }).trim();
      if (lastCommitMessage === "wip") {
        execSync(`git commit --amend --no-edit`);
      } else {
        execSync(`git commit -m "wip"`);
      }
    }
  }
}

execSync(`git checkout main -f`);
