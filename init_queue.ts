import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { appConfig } from "./config";
import { extractNonThai, getAllFiles } from "./utils/extract";

if (!existsSync(".temp")) mkdirSync(".temp");

console.log("Initializing queue...");
getAllFiles({ force: true }); // Refresh novel_files.json
const files = extractNonThai();
if (appConfig.loopSkip) {
  writeFileSync(".temp/skip.txt", "");
}
const skips = existsSync(".temp/skip.txt")
  ? readFileSync(".temp/skip.txt", "utf-8")
  : "";

const queue = files.filter((file) => !skips.includes(file));

writeFileSync(
  ".temp/queue.txt",
  queue.join("\n") + (queue.length > 0 ? "\n" : ""),
  "utf-8",
);
