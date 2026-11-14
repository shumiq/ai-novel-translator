// Name: Squash Data Branch
// Description: Squash the data branch into a single commit
// Usage: bun tools/squash_data_branch.ts [--committed-only]
import { execSync } from "child_process";
import { existsSync } from "fs";
import { novelDataRoot } from "../config";
import { Logger } from "../utils/logger";

const COMMITTED_ONLY = process.argv.includes("--committed-only");

function git(args: string): string {
  return execSync(`git ${args}`, {
    cwd: novelDataRoot,
    encoding: "utf-8",
  }).trim();
}

function main(): void {
  if (!existsSync(novelDataRoot)) {
    throw new Error(`Data worktree not found: ${novelDataRoot}`);
  }

  let head: string;
  try {
    head = git("symbolic-ref --short HEAD");
  } catch {
    throw new Error("Data worktree is not on a branch");
  }
  if (head !== "data") {
    throw new Error(`Data worktree is on ${head}, expected data`);
  }

  const dirty = git("status --porcelain");
  if (dirty && COMMITTED_ONLY) {
    throw new Error(
      "Data worktree has uncommitted changes. Commit them first or omit --committed-only.",
    );
  }

  let count = 0;
  try {
    count = Number(git("rev-list --count data"));
  } catch {
    count = 0;
  }

  if (count === 0 && !dirty) {
    throw new Error("Data branch has no commits and no changes.");
  }
  if (count <= 1 && !dirty) {
    Logger.info("Data branch already has a single commit.");
    return;
  }

  // Include the current working tree in the squashed commit unless the caller
  // explicitly wants to squash only existing commits.
  if (dirty) git("add -A");
  const tree = dirty ? git("write-tree") : git("rev-parse data^{tree}");

  const suffix = dirty ? " + working changes" : "";
  const message = `squash: data branch (${count} commit${count === 1 ? "" : "s"}${suffix})`;
  const commit = git(`commit-tree ${tree} -m ${JSON.stringify(message)}`);
  git(`update-ref refs/heads/data ${commit}`);

  const newCount = Number(git("rev-list --count data"));
  const newTree = git("rev-parse data^{tree}");
  if (newCount !== 1 || newTree !== tree) {
    throw new Error(`Squash verification failed (${newCount} commits)`);
  }

  Logger.done(`Squashed data branch into ${commit.slice(0, 9)}`);
}

try {
  main();
} catch (err) {
  Logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
