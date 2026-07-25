import { execSync } from "child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { appConfig, novelConfig } from "./config";
import { extraction } from "./instructions/1_extraction";
import { translation } from "./instructions/2_translation";
import { consistencyCheck } from "./instructions/3_consistency";
import { humanization } from "./instructions/4_humanization";
import { isThai } from "./utils/lang";
import { Logger } from "./utils/logger";
import {
  ensureTempDir,
  getNextFromQueue,
  removeFirstFromQueue,
} from "./utils/temp";

const getFinalFile = (file: string) => {
  const files = [
    `.temp/final_humanized_${file.replaceAll("/", "_")}`,
    `.temp/consistency_checked_${file.replaceAll("/", "_")}`,
    `.temp/translated_${file.replaceAll("/", "_")}`,
    file,
  ];
  for (const file of files) {
    if (existsSync(file)) return file;
  }
  return file;
};

export const runnerAPI = async () => {
  ensureTempDir();
  let count = 0;
  const LIMIT = 10;

  while (true) {
    const file = getNextFromQueue();
    if (!file) break;

    count++;
    Logger.step("", `[${count}] ${file}`);

    if (count >= LIMIT) {
      Logger.warn(`Reached limit of ${LIMIT} files. Resetting skip list.`);
      if (appConfig.loopSkip) writeFileSync(".temp/skip.txt", "");
      process.exit(1);
    }

    try {
      while (true) {
        if (
          appConfig.pipeline.includes("extraction") &&
          !existsSync(`.temp/extraction_${file.replaceAll("/", "_")}`)
        ) {
          await extraction(file);
        }

        if (
          appConfig.pipeline.includes("translation") &&
          !existsSync(`.temp/translated_${file.replaceAll("/", "_")}`)
        ) {
          await translation(file);
        }

        if (
          appConfig.pipeline.includes("consistency") &&
          !existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
        ) {
          await consistencyCheck(file);
        }

        if (appConfig.pipeline.includes("humanization")) {
          await humanization(file);
        }

        const finalOutputFile = getFinalFile(file);

        if (
          existsSync(finalOutputFile) &&
          (!appConfig.validation.isThai ||
            isThai(readFileSync(finalOutputFile, "utf-8")))
        ) {
          writeFileSync(file, readFileSync(finalOutputFile, "utf-8"));

          if (existsSync(`.temp/extraction_${file.replaceAll("/", "_")}`))
            rmSync(`.temp/extraction_${file.replaceAll("/", "_")}`);
          if (existsSync(`.temp/translated_${file.replaceAll("/", "_")}`))
            rmSync(`.temp/translated_${file.replaceAll("/", "_")}`);
          if (
            existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
          )
            rmSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`);
          if (existsSync(finalOutputFile)) rmSync(finalOutputFile);

          Logger.info(`Successfully completed: ${file}`);

          if (appConfig.pipeline.includes("humanization")) {
            appendFileSync(".temp/humanized.txt", `${file}\n`);
          }

          execSync(`git add "${file}"`);

          removeFirstFromQueue();
          break;
        } else {
          Logger.error(
            `Final output is not completely in Thai. Restarting pipeline for ${file}`,
          );
          if (existsSync(`.temp/translated_${file.replaceAll("/", "_")}`))
            rmSync(`.temp/translated_${file.replaceAll("/", "_")}`);
          if (
            existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
          )
            rmSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`);
          if (existsSync(finalOutputFile)) rmSync(finalOutputFile);
        }
      }
    } catch (e) {
      Logger.warn(`Found error on ${file}. Skipping this file.`);
      // Clean up temp files for this file
      const safeName = file.replaceAll("/", "_");
      for (const prefix of [
        "extraction_",
        "translated_",
        "consistency_checked_",
        "final_humanized_",
      ]) {
        const p = `.temp/${prefix}${safeName}`;
        if (existsSync(p)) rmSync(p);
      }
      removeFirstFromQueue();
      continue;
    }
  }

  if (
    readFileSync(".temp/queue.txt", "utf-8").trim() ||
    readFileSync(".temp/skip.txt", "utf-8").trim()
  ) {
    process.exit(1);
  }
  Logger.step("🧹", "Leftover cleanup");

  if (novelConfig.originalLanguage === "Japanese") {
    Logger.info("  └─ translate_leftover_japanese");
    execSync(`bun translate_leftover_japanese.ts`);
  } else {
    Logger.info("  └─ translate_leftover_english");
    execSync(`bun translate_leftover_english.ts`);
  }

  Logger.done("Pipeline complete");
  process.exit(0);
};
