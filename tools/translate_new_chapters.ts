// Name: Translate New Chapters
// Description: Translate titles marked .to_be_translated with the full pipeline
import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { appRoot } from "../config";
import { Logger } from "../utils/logger";
import { forEachTitle } from "../utils/title";
import type { NovelConfig } from "../utils/types";

function readTitleConfig(dir: string): NovelConfig {
  return JSON.parse(
    readFileSync(join(dir, "novel_config.json"), "utf-8"),
  ) as NovelConfig;
}

function spawn(
  script: string,
  id: string,
  stdio: "inherit" | "pipe" = "inherit",
) {
  return execSync(`bun tools/${script}`, {
    cwd: appRoot,
    stdio,
    encoding: "utf-8",
    env: { ...process.env, NOVEL_TITLE: id },
  });
}

async function main(): Promise<void> {
  let processed = 0;
  let failed = 0;
  const badCharReports: string[] = [];

  await forEachTitle(async (id, dir) => {
    const marker = join(dir, ".to_be_translated");
    if (!existsSync(marker)) {
      Logger.info(`Skip ${id} (not marked for translation)`);
      return;
    }

    Logger.info(`Translating ${id}...`);
    processed++;

    try {
      const config = readTitleConfig(dir);
      if (config.originalLanguage === "Japanese") {
        spawn("merge_multiline_speech_jp.ts", id);
      }
      spawn("start_translation_pipeline.ts", id);

      let report = "";
      try {
        report = spawn("check_bad_characters.ts", id, "pipe");
      } catch (err) {
        const failedErr = err as { stdout?: string; stderr?: string };
        report = `${failedErr.stdout ?? ""}${failedErr.stderr ?? ""}`;
      }
      badCharReports.push(`--- ${id} ---\n${report.trim()}`);

      rmSync(marker, { force: true });
      writeFileSync(join(dir, ".to_check_bad_character"), "");
      Logger.info(
        `  └─ ${id}: translation complete; changes staged but uncommitted`,
      );
    } catch (raw) {
      failed++;
      const message = raw instanceof Error ? raw.message : String(raw);
      Logger.error(`Translation failed for ${id}: ${message} (marker kept)`);
    }
  });

  if (processed === 0) {
    Logger.info("No titles marked for translation.");
  } else {
    Logger.done(`Processed ${processed} title(s), ${failed} failed`);
  }

  if (badCharReports.length > 0) {
    Logger.step("🔍", "Bad character check results");
    for (const report of badCharReports) console.log(report);
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
