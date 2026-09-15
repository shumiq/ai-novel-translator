// Name: Fix Bad Characters
// Description: Fix bad/unwanted characters in translated Thai HTML files (auto-scans all Thai files)
import { execSync } from "child_process";
import { rmSync, writeFileSync } from "fs";
import { appConfig } from "../config";
import { scanAllFilesForBadChars } from "../utils/fix_bad_characters";
import { ensureTempDir } from "../utils/temp";

while (true) {
  const results = scanAllFilesForBadChars();

  if (results.length === 0) {
    console.log("No bad characters found.");
    process.exit(0);
  }

  // Build task list table (max 3 files per batch)
  const tableRows: string[] = [];
  for (const result of results.slice(0, 3)) {
    for (const issue of result.issues) {
      const chars = [
        ...issue.badChars.map(
          (c) =>
            `"${c}" (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`,
        ),
        ...issue.mixedScriptPairs.map((p) => `mixed "${p}"`),
      ].join(", ");
      tableRows.push(
        `| ${result.file} | ${issue.line} | ${chars} | \`${issue.originalLine}\` |`,
      );
    }
  }

  ensureTempDir();
  writeFileSync(
    ".temp/INSTRUCTION.md",
    `# Agent Task: Fix Bad Characters in Thai HTML

## Mode
This task should be handled by the **bad-character-fixer** agent (see \`.opencode/agents/bad-character-fixer.md\`).

## Role
You are a Thai text restoration expert. Your task is to fix bad or unwanted characters in specific lines of HTML files by **intelligently replacing** them with the correct characters based on context.

## Core Principle
**Replace, don't remove.** Read the full line, understand the Thai word, and figure out what the bad character should have been. The goal is to restore the text to what the author intended.

## Common Fixes
- **Lao characters that look like Thai (MOST COMMON):** Lao and Thai scripts have visually identical characters but different Unicode blocks. Replace Lao with the Thai equivalent.
  - Example: \`ເດຍວກອນ\` → \`เดี๋ยวก่อน\` (Lao ວ U+0EA7 → Thai ว U+0E27, Lao ກ U+0E81 → Thai ก U+0E01)
  - Common Lao→Thai pairs: ກ→ก, ຂ→ข, ຄ→ค, ຈ→จ, ຊ→ซ, ຍ→ญ, ດ→ด, ຕ→ต, ຖ→ถ, ນ→น, ບ→บ, ປ→ป, ຜ→ผ, ຝ→ฝ, ພ→พ, ຟ→ฟ, ມ→ม, ຢ→ย, ຣ→ร, ວ→ว, ຦→ศ, ສ→ส, ຮ→ห, ຯ→ฬ, ະ→อ
- **Corrupted Thai vowels/tone marks:** A vowel or tone mark may have been replaced with a visually similar but wrong character.
  - Example: \`ก้\` → \`ก็\` (wrong tone mark)
  - Look at surrounding Thai characters to determine what the correct vowel/tone should be.
- **Wrong Thai character:** A Thai character that looks similar but is incorrect. Use context to determine the intended word.
- **Invalid symbols:** Replace with Thai or standard equivalents (e.g., curly quotes → Thai quotes \`「」\`).
- **Mixed script:** Insert a space between adjacent Thai and Latin characters.
- **\`ww\` → \`55\`:** In Japanese, \`ww\` means laugh. In Thai, replace with \`55\` (5 = ห้า = "ha", so 55 = "haha").
- **Emoticons with special characters → text:** Replace kaomoji/emoticons with Thai text descriptions.
  - Face emoticons → \`{ยิ้ม}\`, \`{ร้องไห้}\`, etc.
  - Shocked face → \`{ตาค้าง}\`
  - Excited face → \`{ตื่นเต้น}\`
  - Table flip → \`{ล้มโต๊ะ}\`
- **Truly unrecognizable:** Only remove if you cannot determine what the character should be — this should be rare.

## Constraints
- **No Code Generation:** Do not write Python, Bash, or any other scripts to perform the task. Edit the files directly.
- **One File at a Time:** Process the task list sequentially. Read one file, fix its lines, save it, then move to the next file. Do NOT open or read multiple files simultaneously.
- **Precision:** Only modify the specific line numbers provided. Do not change other lines.
- **Integrity:** Ensure HTML tags (e.g., \`<p>\`, \`<a>\`, \`<span>\`) are preserved exactly as they are; only modify the text content.
- **Readable output:** The fixed text must read naturally in Thai. If unsure about a replacement, prefer the most common/likely character for that context.

## Execution Steps
1.  **Read File 1:** Open the first file in the task list. Read its content.
2.  **Fix Lines:** For each target line in that file, read the full line to understand context. Identify the bad characters and determine what they should be replaced with based on the Thai word. Apply the replacement.
3.  **Save File 1:** Write the fixed content back to the file.
4.  **Next File:** Repeat steps 1–3 for the next file in the list until all are completed.

## Task List

| File Path | Target Line | Bad Characters | Original Line |
| :--- | :--- | :--- | :--- |
${tableRows.join("\n")}

## Quality Checklist
- Were all listed bad characters replaced with appropriate equivalents?
- Does the fixed text read naturally in Thai?
- Are there any remaining invalid characters in the specified lines? (Should be none)
- Did I accidentally delete any HTML closing tags?
- Did I skip any lines in files with multiple target lines?`,
  );

  execSync(
    `opencode run "Fix bad characters in Thai HTML files" --auto --model ${appConfig.model.opencode} --agent bad-character-fixer -- --variant ${appConfig.thinking}`,
    {
      stdio: "inherit",
      timeout: 1000 * 60 * 10,
      killSignal: "SIGKILL",
    },
  );

  rmSync(".temp/INSTRUCTION.md");
}
