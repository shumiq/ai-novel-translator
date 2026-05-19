import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { appConfig } from "./config";
import { extraction } from "./instructions/1_extraction";
import { translation } from "./instructions/2_translation";
import { consistencyCheck } from "./instructions/3_consistency";
import { humanization } from "./instructions/4_humanization";
import { extractNonThai } from "./utils/extract";
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

export const runnerAPI = async () => {
  const files = extractNonThai();
  const skips = readFileSync("skip.txt", "utf-8");
  let count = 0;
  const LIMIT = 10;
  for (const file of files) {
    if (skips.includes(file)) {
      Logger.info(`Skipping: ${file}`);
      continue;
    }
    if (count++ >= LIMIT) {
      if (appConfig.loopSkip) writeFileSync("skip.txt", "");
      process.exit(1);
    }
    try {
      // Loop to ensure we only proceed to the next file after successful passes of the current file
      while (true) {
        // PASS-1: Extract high-impact terms using the API and update the dictionary
        if (
          appConfig.pipeline.includes("extraction") &&
          !existsSync(`.temp/extraction_${file.replaceAll("/", "_")}`)
        ) {
          await extraction(file);
        }

        // PASS-2: Translate the extracted terms using the API and update the dictionary with translations
        if (
          appConfig.pipeline.includes("translation") &&
          !existsSync(`.temp/translated_${file.replaceAll("/", "_")}`)
        ) {
          await translation(file);
        }

        // PASS-3: Consistency check - Ensure the translated file has matched translated terms from the dictionary.
        if (
          appConfig.pipeline.includes("consistency") &&
          !existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
        ) {
          await consistencyCheck(file);
        }

        // PASS-4: Humanize the translated text
        if (appConfig.pipeline.includes("humanization")) {
          await humanization(file);
        }

        // Final check to ensure the output file is in Thai before proceeding to the next file
        const finalOutputFile = getFinalFile(file);

        if (
          existsSync(finalOutputFile) &&
          isThai(readFileSync(finalOutputFile, "utf-8"))
        ) {
          // Success! Overwrite the real file and clean up.
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

          break; // Moves to the next file
        } else {
          Logger.error(
            `Final output is not completely in Thai. Restarting pipeline for ${file}`,
          );
          // Clean up temps to start completely fresh for Pass 2
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
      continue;
    }
  }
  if (appConfig.loopSkip) {
    if (readFileSync("skip.txt", "utf-8").trim() === "") process.exit(0);
    writeFileSync("skip.txt", "");
    process.exit(1);
  } else {
    process.exit(0);
  }
};
