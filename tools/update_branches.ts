// Name: Update Titles
// Description: Fetch new web chapters into the data worktree (no git branches, no rebasing)
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { isAbsolute, join, resolve } from "path";
import { appRoot } from "../config";
import { Logger } from "../utils/logger";
import { forEachTitle } from "../utils/title";
import type { NovelConfig } from "../utils/types";

function readTitleConfig(dir: string): NovelConfig {
  const raw = JSON.parse(
    readFileSync(join(dir, "novel_config.json"), "utf-8"),
  ) as NovelConfig;
  const absolute = (value: string) =>
    !value ? "" : isAbsolute(value) ? value : resolve(appRoot, value);
  return {
    ...raw,
    originalPath: absolute(raw.originalPath),
    outputPath: absolute(raw.outputPath),
    dictionaryPath: absolute(raw.dictionaryPath),
  };
}

function jsonNames(dir: string): string[] | null {
  if (!dir || !existsSync(dir)) return null;
  return readdirSync(dir).filter((f) => f.endsWith(".json"));
}

function hasNewChapters(config: NovelConfig, dir: string): boolean {
  const sources = jsonNames(config.originalPath);
  const outputs = jsonNames(config.outputPath);

  // EPUB / no configured source: nothing to fetch automatically.
  if (!sources && !outputs) return false;

  const committed = new Set(jsonNames(join(dir, "json")) ?? []);
  return [...(sources ?? []), ...(outputs ?? [])].some(
    (name) => !committed.has(name),
  );
}

async function main(): Promise<void> {
  let updated = 0;
  let failed = 0;

  await forEachTitle(async (id, dir) => {
    try {
      const config = readTitleConfig(dir);
      if (!hasNewChapters(config, dir)) {
        Logger.info(`Skip ${id} (no new chapters)`);
        return;
      }

      Logger.info(`Fetching new chapters for ${id}...`);
      execSync("bun tools/prepare.ts", {
        cwd: appRoot,
        stdio: "inherit",
        env: { ...process.env, NOVEL_TITLE: id },
      });

      const status = execSync(
        "git status --porcelain -- books json novel_data.json",
        { cwd: dir, encoding: "utf-8" },
      );
      if (!status.trim()) {
        Logger.info(`  └─ ${id}: nothing to commit`);
        return;
      }

      execSync("git add -- books json novel_data.json", { cwd: dir });
      execSync(`git commit -m "prepare: ${id}"`, { cwd: dir });
      writeFileSync(join(dir, ".to_be_translated"), "");
      Logger.info(`  └─ ${id}: committed and marked for translation`);
      updated++;
    } catch (raw) {
      failed++;
      const message = raw instanceof Error ? raw.message : String(raw);
      Logger.error(`Failed to update ${id}: ${message}`);
    }
  });

  Logger.done(`Updated ${updated} title(s), ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
