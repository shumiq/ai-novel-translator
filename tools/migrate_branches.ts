// Name: Migrate Branches
// Description: Import books/json/dictionary from old web/* and epub/* branches into the data worktree
// Usage: bun tools/migrate_branches.ts [--apply] [--force]
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { isAbsolute, join } from "path";
import { appRoot, novelDataRoot } from "../config";
import { Logger } from "../utils/logger";
import type { NovelConfig } from "../utils/types";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

function parseString(source: string, key: string): string {
  const match = new RegExp(`${key}:\\s*"([^"]*)"`).exec(source);
  return match?.[1] ?? "";
}

function parseStringArray(source: string, key: string): string[] {
  const match = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`).exec(source);
  if (!match?.[1]) return [];
  return Array.from(match[1].matchAll(/"([^"]*)"/g), (m) => m[1] ?? "");
}

function fromAppRoot(value: string): string {
  if (!value) return "";
  return isAbsolute(value) ? value : join(appRoot, value);
}

function listBranches(pattern: string): string[] {
  return execSync(`git branch --list "${pattern}"`, {
    cwd: appRoot,
    encoding: "utf-8",
  })
    .split("\n")
    .map((line) => line.replace(/^[*+ ]+/, "").trim())
    .filter(Boolean);
}

function treeFiles(branch: string): string[] {
  return execSync(`git ls-tree -r --name-only "${branch}"`, {
    cwd: appRoot,
    encoding: "utf-8",
  })
    .split("\n")
    .filter(Boolean);
}

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".to_") || entry.name === ".temp") continue;
    if (entry.isDirectory()) count += countFiles(join(dir, entry.name));
    else count++;
  }
  return count;
}

function extract(branch: string, target: string, files: string[]): void {
  const hasBooks = files.some((f) => f.startsWith("books/"));
  const hasJson = files.some((f) => f.startsWith("json/"));
  const hasDictionary = files.includes("novel_data.json");

  const paths = [
    hasBooks ? "books" : null,
    hasJson ? "json" : null,
    hasDictionary ? "novel_data.json" : null,
  ].filter((p): p is string => p !== null);

  if (paths.length > 0) {
    const cmd = `git archive "${branch}" -- ${paths.join(" ")} | tar -x -C ${JSON.stringify(target)}`;
    execSync(cmd, { cwd: appRoot, stdio: "inherit" });
  }

  if (!hasBooks) mkdirSync(join(target, "books"), { recursive: true });
  if (!hasJson) mkdirSync(join(target, "json"), { recursive: true });
  if (!hasDictionary) writeFileSync(join(target, "novel_data.json"), "{}\n");
}

async function main(): Promise<void> {
  const branches = [
    ...listBranches("web/*").map((b) => ({ branch: b, type: "web" as const })),
    ...listBranches("epub/*").map((b) => ({
      branch: b,
      type: "epub" as const,
    })),
  ];

  Logger.info(
    `${APPLY ? "Applying" : "Dry run"}: ${branches.length} branches -> ${novelDataRoot}`,
  );

  let migrated = 0;
  let skipped = 0;

  for (const { branch, type } of branches) {
    const slug = branch.slice(type.length + 1);
    const target = join(novelDataRoot, type, slug);

    if (existsSync(target) && readdirSync(target).length > 0 && !FORCE) {
      Logger.info(`Skip ${branch} (target already populated)`);
      skipped++;
      continue;
    }

    const source = execSync(`git show "${branch}:config.ts"`, {
      cwd: appRoot,
      encoding: "utf-8",
    });
    const config: NovelConfig = {
      originalPath: fromAppRoot(parseString(source, "originalPath")),
      outputPath: fromAppRoot(parseString(source, "outputPath")),
      dictionaryPath: fromAppRoot(parseString(source, "dictionaryPath")),
      title: parseString(source, "title"),
      originalLanguage: parseString(source, "originalLanguage") || "Japanese",
      additionalContext: parseStringArray(source, "additionalContext"),
    };

    const files = treeFiles(branch);
    const hasDictionary = files.includes("novel_data.json");
    const expected =
      files.filter(
        (f) =>
          f.startsWith("books/") ||
          f.startsWith("json/") ||
          f === "novel_data.json",
      ).length +
      1 + // novel_config.json
      (hasDictionary ? 0 : 1); // created empty dictionary

    Logger.info(
      `${branch}: ${expected} files -> ${target} (title=${JSON.stringify(config.title)})`,
    );

    if (APPLY) {
      if (FORCE && existsSync(target)) {
        rmSync(target, { recursive: true, force: true });
      }
      mkdirSync(target, { recursive: true });
      writeFileSync(
        join(target, "novel_config.json"),
        JSON.stringify(config, null, 2) + "\n",
      );
      extract(branch, target, files);

      const actual = countFiles(target);
      if (actual !== expected) {
        throw new Error(
          `${branch}: file count mismatch (expected ${expected}, got ${actual})`,
        );
      }
    }

    migrated++;
  }

  Logger.done(
    `${APPLY ? "Migrated" : "Would migrate"} ${migrated} title(s), skipped ${skipped}`,
  );
}

main().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
