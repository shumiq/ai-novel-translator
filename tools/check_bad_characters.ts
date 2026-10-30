// Name: Check Bad Characters
// Description: Check for bad/unwanted characters in translated Thai files
import { readFileSync } from "fs";
import { extractThai } from "../utils/extract";
import { Logger } from "../utils/logger";
import { checkBadCharacters } from "../utils/validate";

// --- main ---

const files = extractThai();

if (files.length === 0) {
  Logger.info("No Thai files found.");
  process.exit(0);
}

Logger.info(`Checking ${files.length} Thai file(s)`);

let filesWithIssues = 0;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const error = checkBadCharacters(content, file);
  if (error) {
    filesWithIssues++;
  }
}

console.log("");
if (filesWithIssues === 0) {
  Logger.done("No bad characters found.");
} else {
  Logger.error(`Bad characters found in ${filesWithIssues} file(s).`);
  process.exitCode = 1;
}
