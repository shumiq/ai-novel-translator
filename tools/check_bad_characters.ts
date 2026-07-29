// Name: Check Bad Characters
// Description: Check for bad/unwanted characters in translated Thai files
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { extractThai } from "../utils/extract";
import { Logger } from "../utils/logger";
import { checkBadCharacters } from "../utils/validate";

// --- main ---

const all = process.argv.includes("--all");

let files: string[];

if (all) {
  files = extractThai();
  Logger.info(`Checking all Thai files (${files.length} files)`);
} else {
  // Get changed files in books/ — both staged and unstaged
  const staged = execSync("git diff --cached --name-only -- books/", {
    encoding: "utf-8",
  })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f);

  const unstaged = execSync("git diff --name-only -- books/", {
    encoding: "utf-8",
  })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f);

  // Merge and deduplicate
  files = [...new Set([...staged, ...unstaged])];

  if (files.length === 0) {
    Logger.info("No changed files in books/ — nothing to check.");
    process.exit(0);
  }
  Logger.info(`Checking ${files.length} changed file(s) in books/`);
}

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
