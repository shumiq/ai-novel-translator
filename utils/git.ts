import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import { Logger } from "./logger";

export const LOCK_PATH = ".git/index.lock";
export const REBASE_MERGE_PATH = ".git/rebase-merge";

export function getBranches(pattern: string): string[] {
  return execSync(`git branch --list "${pattern}"`, { encoding: "utf-8" })
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function cleanGitState(): void {
  try {
    if (existsSync(LOCK_PATH)) {
      rmSync(LOCK_PATH, { force: true });
      Logger.warn("Removed stale index.lock");
    }
  } catch { /* ignore */ }

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
    } catch { /* ignore */ }
  }
}

export async function execShell(
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

export async function hasChanges(): Promise<boolean> {
  const out = await execShell("git status --porcelain");
  return out.length > 0;
}

export async function hasStagedChanges(): Promise<boolean> {
  const out = await execShell("git diff --cached --stat");
  return out.length > 0;
}

export async function intFromShell(command: string): Promise<number> {
  return parseInt(await execShell(command), 10);
}

export async function getLastCommitMessage(branch: string): Promise<string> {
  return execShell(`git log -1 --pretty=%B "${branch}"`);
}
