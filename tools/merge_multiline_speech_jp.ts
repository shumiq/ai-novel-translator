// Name: Merge Multi-line Speech (JP)
// Description: Merge multi-line Japanese speech segments in HTML files before translation
import { execSync } from "child_process";
import { Glob } from "bun";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";
import { isThai } from "../utils/lang";
import { Logger } from "../utils/logger";
import { appConfig } from "../config";
import { isLineCloseQuote, findProblematicLines } from "../utils/japanese";
import { ensureTempDir } from "../utils/temp";

const glob = new Glob("books/**/*html");

while (true) {
  const files = Array.from(glob.scanSync(".")) as string[];
  const unmatchedFiles: string[] = [];

  for (const file of files) {
    const rawHTML = readFileSync(file, "utf-8");
    if (isThai(rawHTML)) continue;

    const lines = rawHTML.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i] ?? "";
      const trimmedLine = line.trim();

      if (!isLineCloseQuote(trimmedLine)) {
        // 1. Strip the <p> tags from the first line immediately
        let mergedContent = trimmedLine.replace(/<\/?p>/g, "");
        i++;

        // 2. Keep merging lines until quotes balance
        while (i < lines.length) {
          const nextLine = (lines[i] ?? "").trim();
          mergedContent = mergedContent + " " + nextLine.replace(/<\/?p>/g, "");

          if (isLineCloseQuote(mergedContent)) {
            break;
          }
          i++;
        }

        // 3. If we reached end-of-file and quotes still don't balance, flag the file
        if (!isLineCloseQuote(mergedContent)) {
          unmatchedFiles.push(file);
          break; // Stop processing this file (leave it unmodified)
        }

        // 4. Wrap the clean content in a single set of tags
        result.push(`<p>${mergedContent}</p>`);
        i++;
        continue;
      }

      result.push(line ?? "");
      i++;
    }

    // If the file was flagged, skip writing it (keep original for agent to fix)
    if (unmatchedFiles.includes(file)) continue;

    writeFileSync(file, result.join("\n"));
    Logger.progress(`Processed ${file}`);
  }

  if (unmatchedFiles.length === 0) {
    Logger.info("All speech lines merged successfully.");
    break;
  }

  // ── Build task list for the agent ──────────────────────────────────
  Logger.warn(
    `Found ${unmatchedFiles.length} file(s) with probably-mistaken quotes. Dispatching to agent for fixing...`,
  );

  const taskLines: string[] = [];
  for (const file of unmatchedFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = findProblematicLines(content);
    if (lines.length > 0) {
      taskLines.push(`| ${file} | ${lines.join(", ")} |`);
    }
  }

  ensureTempDir();
  writeFileSync(
    ".temp/INSTRUCTION.md",
    `# Agent Task: Fix Unmatched Japanese Quote Characters

## Mode
This task should be handled by the **japanese-quote-fixer** agent (see \`.opencode/agents/japanese-quote-fixer.md\`).

## Role
You are a Japanese text formatting expert. Your task is to fix unmatched Japanese quote characters (\`「\`, \`」\`, \`『\`, \`』\`) in HTML files.

## Objective
Directly edit the specified files and lines so that the number of opening quotes (\`「\` + \`『\`) equals the number of closing quotes (\`」\` + \`』\`) on every line. The quotes may be unbalanced because the author forgot to open/close a quote, used an extra quote, or used a different symbol.

## Constraints
- **No Code Generation:** Do not write Python, Bash, or any other scripts to perform the task. Edit the files directly.
- **Precision:** Only modify the specific line numbers provided. Do not change other lines.
- **Integrity:** Ensure HTML tags (e.g., \`<p>\`, \`<a>\`, \`<span>\`) are preserved exactly as they are; only fix the quote characters.

## Execution Steps
1.  **Locate:** Open the file specified in the task list.
2.  **Identify:** Go to the exact line number(s) mentioned.
3.  **Analyze:** Count the \`「\`, \`」\`, \`『\`, and \`』\` characters. Determine if the line has too many opening or closing quotes.
4.  **Fix:**
    - If an opening quote is missing, add one where it makes sense contextually.
    - If a closing quote is missing, add one where it makes sense contextually.
    - If the wrong quote symbol was used (e.g., opening \`「\` mistakenly used where closing \`」\` was intended), replace it with the correct one.
    - If there are extra duplicate quotes, remove the extras.
5.  **Verify:** After your edit, the number of opening quotes (\`「\` + \`『\`) should equal the number of closing quotes (\`」\` + \`』\`) on every line you touched. Move to the next file in the list until all are completed.

## Task List

| File Path | Target Lines |
| :--- | :--- |
${taskLines.join("\n")}

## Quality Checklist
- Is the quote count balanced on each line I edited?
- Are the quotes contextually correct (do they match the surrounding speech)?
- Did I accidentally delete any HTML closing tags?
- Did I skip any lines in files with multiple target lines?
`,
  );

  execSync(
    `opencode run "Fix unmatched Japanese quote characters" --model google/${appConfig.model.agent} --agent japanese-quote-fixer -- --variant med`,
    {
      stdio: "inherit",
      timeout: 1000 * 60 * 10,
      killSignal: "SIGKILL",
    },
  );

  rmSync(".temp/INSTRUCTION.md");
}
