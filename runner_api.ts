import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { appConfig } from "./config";
import { extraction } from "./instructions/1_extraction";
import { translation } from "./instructions/2_translation";
import { consistencyCheck } from "./instructions/3_consistency";
import { humanization } from "./instructions/4_humanization";
import { isThai } from "./utils/lang";
import { Logger } from "./utils/logger";

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

const startMemoryWatcher = () => {
  const limitBytes = (appConfig.memoryLimitMB || 0) * 1024 * 1024;
  if (!limitBytes) return;

  const id = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > limitBytes) {
      Logger.warn(
        `Memory limit exceeded (${(rss / 1024 / 1024).toFixed(0)} MB > ${appConfig.memoryLimitMB} MB). Exiting to let start.bat restart.`,
      );
      clearInterval(id);
      process.exit(1);
    }
  }, 5000).unref();
};

const getNextFile = (): string | null => {
  if (!existsSync(".temp/queue.txt")) return null;
  const content = readFileSync(".temp/queue.txt", "utf-8").trim();
  if (!content) return null;
  return content.split("\n")[0] || null;
};

const removeFirstFromQueue = () => {
  const content = readFileSync(".temp/queue.txt", "utf-8").trim();
  const lines = content.split("\n");
  lines.shift();
  writeFileSync(".temp/queue.txt", lines.join("\n") + "\n", "utf-8");
};

export const runnerAPI = async () => {
  startMemoryWatcher();
  let count = 0;
  const LIMIT = 10;

  while (true) {
    const file = getNextFile();
    if (!file) break;

    if (count++ >= LIMIT) {
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
          isThai(readFileSync(finalOutputFile, "utf-8"))
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
  process.exit(0);
};
