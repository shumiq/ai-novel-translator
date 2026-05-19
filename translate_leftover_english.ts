import { execSync } from "child_process";
import { readFileSync, rmdir, rmSync, writeFileSync } from "fs";
import { appConfig } from "./config";
import { extractThai } from "./utils/extract";
import { isEnglish, isThai } from "./utils/lang";
import { Logger } from "./utils/logger";

function getEnglishLines(text: string) {
  return text
    .split("\n")
    .map((line, i) =>
      line.trim() !== "" && isEnglish(line) && !isThai(line) ? i + 1 : null,
    )
    .filter(Boolean) as number[];
}

while (true) {
  const files = extractThai();
  const toBeTranslated: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const englishLines = getEnglishLines(content);
    if (englishLines.length === 0) continue;
    toBeTranslated.push(`| ${file} | ${englishLines.join(", ")} |`);
  }

  if (toBeTranslated.length === 0) {
    Logger.info(`No leftover English text found.`);
    process.exit(0);
  }

  writeFileSync(
    ".temp/AGENTS.md",
    `# Agent Task: English to Thai Translation (Leftover Cleanup)

## Role
You are a localization expert proficient in English and Thai. Your task is to identify and translate specific lines of English text remaining in HTML files into natural-sounding Thai.

## Objective
Directly edit the specified files and lines. Replace the English text with its Thai equivalent while preserving the surrounding HTML structure and ensuring the translation fits the context of the book.

## Constraints
- **No Code Generation:** Do not write Python, Bash, or any other scripts to perform the task. Edit the files directly.
- **Precision:** Only modify the specific line numbers provided. Do not change other lines.
- **Integrity:** Ensure HTML tags (e.g., \`<p>\`, \`<a>\`, \`<span>\`) are preserved exactly as they are; only translate the text content inside or between them.

## Execution Steps
1.  **Locate:** Open the file specified in the task list.
2.  **Identify:** Go to the exact line number(s) mentioned.
3.  **Translate:** 
    - Read the English text.
    - Translate it into Thai.
    - Maintain the tone (literary/formal for books).
4.  **Replace:** Overwrite the English text with the Thai translation in the file.
5.  **Verify:** Move to the next file in the list until all are completed.

## Task List

| File Path | Target Lines |
| :--- | :--- |
${toBeTranslated.join("\n")}

## Quality Checklist
- Is the Thai translation contextually correct for a "book" setting?
- Are there any remaining English characters in the specified lines? (Should be none)
- Did I accidentally delete any HTML closing tags?
- Did I skip any lines in files with multiple target lines (e.g., 'books/133.html')?`,
  );

  execSync(
    `opencode run "Translate leftover English text to Thai" --model google/${appConfig.model} --thinking true -- --variant med`,
    {
      stdio: "inherit",
      timeout: 1000 * 60 * 10,
      killSignal: "SIGKILL",
    },
  );

  rmSync(".temp/AGENTS.md");
}
