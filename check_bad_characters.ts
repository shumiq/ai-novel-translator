// this script will run by either `bun check_bad_characters.ts` or `bun check_bad_characters.ts --all`

// when not --all
// check all changes files in books folder using git commit both staged and unstaged changes
// when --all
// use extractThai

// for each file, read content and check if it has other characters aside from Thai, English, numbers, and special characters, if it has, log the file name and the line number and the line content

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { extractThai } from "./utils/extract";
import { extractLinesFromHtml } from "./utils/text";
import { Logger } from "./utils/logger";
import { isThai } from "@utils/lang";

// Characters we explicitly allow:
// - Thai script
// - Latin (English) letters
// - ASCII digits
// - Common punctuation: quotes, parentheses, brackets, colon, semicolon,
//   comma, period, exclamation/question marks, dash, slash, backslash, pipe,
//   at sign, hash, ampersand, percent, equals, plus, asterisk, tilde, grave,
//   curly braces, underscore, non-breaking space
// - Smart quotes, em dash, en dash, ellipsis, middle dot, ideographic comma/period,
//   fullwidth parentheses, zero-width non-joiner
const BAD_CHAR_RE =
  /[^\p{Script=Thai}\p{Script=Latin}0-9 \t!"'\.\?\(\)\[\]:~—,/ー\-%&※+★><○■*#=αβΘΩ＊◇•→|△●@$^_◆＝≧÷《》]/gu;

function checkFile(filePath: string): number {
  let issues = 0;
  const rawHTML = readFileSync(filePath, "utf-8");
  if (!isThai(rawHTML)) return issues;
  const lines = extractLinesFromHtml(rawHTML);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const matches = line.match(BAD_CHAR_RE);
    if (matches) {
      const uniqueChars = [...new Set(matches)]
        .map(
          (c) =>
            `"${c}" (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`,
        )
        .join(", ");
      Logger.warn(`${filePath}:${i + 1}: ${uniqueChars}`);
      Logger.info(`  ${line}`);
      issues++;
    }
  }
  return issues;
}

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

let totalIssues = 0;
let filesWithIssues = 0;

for (const file of files) {
  const issues = checkFile(file);
  if (issues > 0) {
    totalIssues += issues;
    filesWithIssues++;
  }
}

console.log("");
if (totalIssues === 0) {
  Logger.done("No bad characters found.");
} else {
  Logger.error(
    `${totalIssues} line(s) with bad characters in ${filesWithIssues} file(s).`,
  );
  process.exitCode = 1;
}
