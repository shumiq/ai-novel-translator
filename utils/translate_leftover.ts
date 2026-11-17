// Name: Translate Leftover
// Description: Shared utilities for translating leftover English/Japanese text in translated Thai HTML files
import { execSync } from "child_process";
import { readFileSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { appConfig, appRoot } from "../config";
import { extractThai } from "./extract";
import { isEnglish, isJapanese, isThai } from "./lang";
import { Logger } from "./logger";

function getEnglishLines(text: string) {
  return text
    .split("\n")
    .map((line, i) =>
      line.trim() !== "" && isEnglish(line) && !isThai(line) ? i + 1 : null,
    )
    .filter(Boolean) as number[];
}

function getJapaneseLines(text: string) {
  return text
    .split("\n")
    .map((line, i) => (line.trim() !== "" && isJapanese(line) ? i + 1 : null))
    .filter(Boolean) as number[];
}

function runLeftoverCleanup(
  language: "English" | "Japanese",
  getLines: (text: string) => number[],
  taskDescription: string,
  instructionHeader: string,
  qualityChecklist: string,
) {
  let previous = "";
  while (true) {
    const files = extractThai();
    const toBeTranslated: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const lines = getLines(content);
      if (lines.length === 0) continue;
      toBeTranslated.push(`| ${resolve(file)} | ${lines.join(", ")} |`);
    }

    if (toBeTranslated.length === 0) {
      Logger.info(`No leftover ${language} text found.`);
      process.exit(0);
    }

    // The agent runs once per batch; if a full scan looks identical, it made no
    // edit and re-spawning it would just repeat the same denied-tool loop.
    const signature = toBeTranslated.join("\n");
    if (signature === previous) {
      Logger.warn(
        `No progress on leftover ${language} text after a translation run; stopping to avoid an endless loop.`,
      );
      process.exit(0);
    }
    previous = signature;

    mkdirSync(join(appRoot, ".temp"), { recursive: true });
    const instructionPath = join(appRoot, ".temp/INSTRUCTION.md");
    writeFileSync(
      instructionPath,
      `${instructionHeader}
${toBeTranslated.slice(0, 3).join("\n")}

${qualityChecklist}`,
    );

    execSync(
      `opencode run "${taskDescription}" --auto --model ${appConfig.model.opencode} --agent leftover-translator`,
      {
        cwd: appRoot,
        stdio: "inherit",
        timeout: 1000 * 60 * 10,
        killSignal: "SIGKILL",
      },
    );

    rmSync(instructionPath, { force: true });
  }
}

export function translateLeftoverEnglish() {
  runLeftoverCleanup(
    "English",
    getEnglishLines,
    "Translate leftover English text to Thai",
    `# Agent Task: English to Thai Translation (Leftover Cleanup)

## Mode
Handled by the **leftover-translator** agent. You have only the read and edit tools; every other tool is denied. Do not inspect the repository — the task list below is all the context you need.

## Role
You are a localization expert proficient in English and Thai. Your task is to identify and translate specific lines of English text remaining in HTML files into natural-sounding Thai.

## Objective
Directly edit the specified files and lines. Replace the English text with its Thai equivalent while preserving the surrounding HTML structure and ensuring the translation fits the context of the book.

## Constraints
- **No Code Generation:** Do not write Python, Bash, or any other scripts to perform the task. Edit the files directly.
- **One File at a Time:** Process the task list sequentially. Read one file, translate its lines, save it, then move to the next file. Do NOT open or read multiple files simultaneously.
- **Precision:** Only modify the specific line numbers provided. Do not change other lines.
- **Leftover fragments:** A target line may be mostly Thai with a few leftover English/Japanese characters. Translate/transliterate those characters — do not skip the line as "already Thai".
- **Integrity:** Ensure HTML tags (e.g., \`<p>\`, \`<a>\`, \`<span>\`) are preserved exactly as they are; only translate the text content inside or between them.

## Execution Steps
1.  **Read File 1:** Open the first file in the task list. Read its content.
2.  **Translate Lines:** For each target line in that file, translate the English text to Thai. Maintain the tone (literary/formal for books).
3.  **Save File 1:** Write the translated content back to the file.
4.  **Next File:** Repeat steps 1–3 for the next file in the list until all are completed.

## Task List

| File Path | Target Lines |
| :--- | :--- |`,
    `## Quality Checklist
- Is the Thai translation contextually correct for a "book" setting?
- Are there any remaining English characters in the specified lines? (Should be none)
- Did I accidentally delete any HTML closing tags?
- Did I skip any lines in files with multiple target lines (e.g., 'books/133.html')?`,
  );
}

export function translateLeftoverJapanese() {
  runLeftoverCleanup(
    "Japanese",
    getJapaneseLines,
    "Translate leftover Japanese text to Thai",
    `# Agent Task: Japanese to Thai Translation (Leftover Cleanup)

## Mode
Handled by the **leftover-translator** agent. You have only the read and edit tools; every other tool is denied. Do not inspect the repository — the task list below is all the context you need.

## Role
You are a localization expert proficient in Japanese and Thai. Your task is to identify and translate specific lines of Japanese text remaining in HTML files into natural-sounding Thai.

## Objective
Directly edit the specified files and lines. Replace the Japanese text with its Thai equivalent while preserving the surrounding HTML structure and ensuring the translation fits the context of the book.

## Constraints
- **No Code Generation:** Do not write Python, Bash, or any other scripts to perform the task. Edit the files directly.
- **One File at a Time:** Process the task list sequentially. Read one file, translate its lines, save it, then move to the next file. Do NOT open or read multiple files simultaneously.
- **Precision:** Only modify the specific line numbers provided. Do not change other lines.
- **Leftover fragments:** A target line may be mostly Thai with a few leftover English/Japanese characters. Translate/transliterate those characters — do not skip the line as "already Thai".
- **Integrity:** Ensure HTML tags (e.g., \`<p>\`, \`<a>\`, \`<span>\`) are preserved exactly as they are; only translate the text content inside or between them.

## Execution Steps
1.  **Read File 1:** Open the first file in the task list. Read its content.
2.  **Translate Lines:** For each target line in that file, translate the Japanese text to Thai. Maintain the tone (literary/formal for books).
3.  **Save File 1:** Write the translated content back to the file.
4.  **Next File:** Repeat steps 1–3 for the next file in the list until all are completed.

## Task List

| File Path | Target Lines |
| :--- | :--- |`,
    `## Quality Checklist
- Is the Thai translation contextually correct for a "book" setting?
- Are there any remaining Japanese characters in the specified lines? (Should be none)
- Did I accidentally delete any HTML closing tags?
- Did I skip any lines in files with multiple target lines (e.g., 'books/133.html')?`,
  );
}
