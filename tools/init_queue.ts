// Name: Init Queue
// Description: Build the processing queue from non-Thai files for translation
import { existsSync, readFileSync, writeFileSync } from "fs";
import { appConfig } from "../config";
import { extractNonThai, extractThai, getAllFiles } from "../utils/extract";
import { Logger } from "../utils/logger";
import { ensureTempDir, writeQueue } from "../utils/temp";

ensureTempDir();

Logger.info("Initializing queue...");
getAllFiles({ force: true }); // Refresh novel_files.json

// Auto-detect queue source from pipeline
const needsOriginalText =
  appConfig.pipeline.includes("extraction") ||
  appConfig.pipeline.includes("translation");
const files = needsOriginalText ? extractNonThai() : extractThai();

if (appConfig.loopSkip) {
  writeFileSync(".temp/skip.txt", "");
}
const skips = existsSync(".temp/skip.txt")
  ? readFileSync(".temp/skip.txt", "utf-8")
  : "";
const humanized = existsSync(".temp/humanized.txt")
  ? readFileSync(".temp/humanized.txt", "utf-8")
  : "";

const queue = files.filter(
  (file) => !skips.includes(file) && !humanized.includes(file),
);

writeQueue(queue);
Logger.info(`Queue ready: ${queue.length} files to process`);
