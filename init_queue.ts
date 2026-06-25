import { existsSync, readFileSync, writeFileSync } from "fs";
import { appConfig } from "./config";
import { extractNonThai, getAllFiles } from "./utils/extract";
import { Logger } from "./utils/logger";
import { ensureTempDir, writeQueue } from "./utils/temp";

ensureTempDir();

Logger.info("Initializing queue...");
getAllFiles({ force: true }); // Refresh novel_files.json
const files = extractNonThai();
if (appConfig.loopSkip) {
  writeFileSync(".temp/skip.txt", "");
}
const skips = existsSync(".temp/skip.txt")
  ? readFileSync(".temp/skip.txt", "utf-8")
  : "";

const queue = files.filter((file) => !skips.includes(file));

writeQueue(queue);
Logger.info(`Queue ready: ${queue.length} files to process`);
