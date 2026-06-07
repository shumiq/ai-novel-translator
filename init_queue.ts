import { existsSync, readFileSync, writeFileSync } from "fs";
import { appConfig } from "./config";
import { extractNonThai, getAllFiles } from "./utils/extract";

const currentQueue = existsSync(".temp/queue.txt")
  ? readFileSync(".temp/queue.txt", "utf-8").split("\n").filter(Boolean)
  : [];

if (currentQueue.length > 0) {
  console.log(`Resuming with files in queue...`);
  if (appConfig.loopSkip) {
    const skips = existsSync(".temp/skip.txt")
      ? readFileSync(".temp/skip.txt", "utf-8").split("\n").filter(Boolean)
      : [];
    if (skips.length > 0) {
      writeFileSync(".temp/skip.txt", "");
      writeFileSync(
        ".temp/queue.txt",
        [...skips, currentQueue].join("\n") + "\n",
        "utf-8",
      );
    }
  }
  process.exit(0);
}

console.log("Initializing queue...");
getAllFiles({ force: true }); // Refresh novel_files.json
const files = extractNonThai();
if (appConfig.loopSkip) {
  writeFileSync(".temp/skip.txt", "");
}
const skips = existsSync(".temp/skip.txt") ? readFileSync(".temp/skip.txt", "utf-8") : "";

const queue = files.filter((file) => !skips.includes(file));

writeFileSync(
  ".temp/queue.txt",
  queue.join("\n") + (queue.length > 0 ? "\n" : ""),
  "utf-8",
);
