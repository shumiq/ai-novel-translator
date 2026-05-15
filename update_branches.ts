import { execSync } from "child_process";
import { Logger } from "./utils/logger";

const webBranches = execSync(`git branch --list "web/*"`, { encoding: "utf-8" })
  .split("\n")
  .map((branch) => branch.trim())
  .filter((branch) => branch);

const epubBranches = execSync(`git branch --list "epub/*"`, {
  encoding: "utf-8",
})
  .split("\n")
  .map((branch) => branch.trim())
  .filter((branch) => branch);

execSync(`git checkout main -f`);

for (const branch of [...webBranches, ...epubBranches]) {
  Logger.info(`Rebase branch ${branch}...`);
  execSync(`git checkout ${branch} -f`);
  execSync(`git rebase main`);
  if (branch.startsWith("web/")) {
    Logger.info(`Fetch new chapters for branch ${branch}...`);
    execSync(`git checkout ${branch} -f`);
    execSync(`bun prepare.ts`);
    execSync(`git add .`);
    execSync(`git status`, { stdio: "inherit" });
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
