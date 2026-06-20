import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });

interface Match {
  file: string;
  lineNum: number;
  originalText: string;
  currentLine: string;
  currentText: string;
}

function extractText(line: string | undefined): string | null {
  if (!line) return null;
  const m = line.match(/^<p>(.*)<\/p>$/);
  return m ? (m[1] ?? null) : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, word: string): number {
  if (!word) return 0;
  const regex = new RegExp(escapeRegex(word), "gi");
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

const BOLD = "\x1b[1m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function highlightIn(text: string, word: string, color: string): string {
  if (!word) return text;
  const regex = new RegExp(escapeRegex(word), "gi");
  return text.replace(regex, (m) => `${BOLD}${color}${m}${RESET}`);
}

async function main() {
  const originalWord = await rl.question(
    "Enter original word to search for (in pre-translation text): ",
  );
  const oldWord = await rl.question(
    "Enter old translated word to search for (in current text): ",
  );

  if (!oldWord) {
    console.log("No old word provided. Exiting.");
    rl.close();
    return;
  }

  const stagedRaw = execSync("git diff --cached --name-only -- books/", {
    encoding: "utf-8",
  });
  const stagedFiles = String(stagedRaw)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (stagedFiles.length === 0) {
    console.log("No staged files found under books/.");
    rl.close();
    return;
  }

  const lowerWord = originalWord.toLowerCase();
  const oldWordLower = oldWord.toLowerCase();
  const matches: Match[] = [];

  for (const file of stagedFiles) {
    let originalContent: string;
    try {
      originalContent = execSync(`git show "HEAD:${file}"`, {
        encoding: "utf-8",
      }).toString();
    } catch {
      console.log(`  Skipping ${file} (not found in HEAD, likely new file).`);
      continue;
    }

    const originalLines = originalContent.split(/\r?\n/);
    let currentContent: string;
    try {
      currentContent = readFileSync(file, "utf-8");
    } catch {
      console.log(`  Skipping ${file} (cannot read current file).`);
      continue;
    }
    const currentLines = currentContent.split(/\r?\n/);

    for (let i = 0; i < originalLines.length; i++) {
      const originalLine = originalLines[i];
      const originalText = extractText(originalLine);
      const currentLine = currentLines[i];
      const currentText = extractText(currentLine);

      const matchesOriginal =
        originalText && originalText.toLowerCase().includes(lowerWord);
      const matchesCurrent =
        currentText && currentText.toLowerCase().includes(oldWordLower);

      if (!matchesOriginal || !matchesCurrent) continue;

      matches.push({
        file,
        lineNum: i + 1,
        originalText: originalText ?? "",
        currentLine: currentLine ?? "",
        currentText: currentText ?? "",
      });
    }
  }

  if (matches.length === 0) {
    console.log(
      `No lines found containing "${originalWord}" in original text or "${oldWord}" in current text.`,
    );
    rl.close();
    return;
  }

  console.log(`\nFound ${matches.length} matching lines. Preview (first 10):`);
  for (let i = 0; i < Math.min(10, matches.length); i++) {
    const m = matches[i]!;
    console.log(`  ${i + 1}. ${m.file}:${m.lineNum}`);
    console.log(
      `     ${CYAN}Original:${RESET} ${highlightIn(m.originalText, originalWord, YELLOW)}`,
    );
    console.log(
      `     ${CYAN}Current:${RESET}  ${highlightIn(m.currentText, oldWord, RED)}`,
    );
  }

  const newWord = await rl.question("Enter new translated word: ");

  const oldWordRegex = new RegExp(escapeRegex(oldWord), "gi");

  let replaced = 0;
  let skipped = 0;

  for (let idx = 0; idx < matches.length; idx++) {
    const match = matches[idx]!;
    const { file, lineNum, currentText } = match;

    if (!currentText || !currentText.toLowerCase().includes(oldWordLower)) {
      skipped++;
      continue;
    }

    const content = readFileSync(file, "utf-8");
    const hasCRLF = content.includes("\r\n");
    const lines = hasCRLF ? content.split("\r\n") : content.split("\n");
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];

    if (!line) {
      skipped++;
      continue;
    }

    const text = extractText(line);
    if (!text || !text.toLowerCase().includes(oldWordLower)) {
      skipped++;
      continue;
    }

    const newText = text.replace(oldWordRegex, newWord);
    const newLine = line.replace(text, newText);

    const origCount = countOccurrences(match.originalText, originalWord);
    const oldCount = countOccurrences(match.currentText, oldWord);
    const newCount = countOccurrences(newText, newWord);

    console.log(`\n[${idx + 1}/${matches.length}] --- ${file}:${lineNum} ---`);
    console.log(
      `  ${CYAN}Original:${RESET} ${highlightIn(match.originalText, originalWord, YELLOW)}`,
    );
    console.log(`  ${RED}Before:${RESET}   ${highlightIn(line, oldWord, RED)}`);
    console.log(
      `  ${GREEN}After:${RESET}    ${highlightIn(newLine, newWord, GREEN)}`,
    );

    if (origCount === oldCount && oldCount === newCount) {
      lines[lineIndex] = newLine;
      writeFileSync(file, lines.join(hasCRLF ? "\r\n" : "\n"), "utf-8");
      replaced++;
      console.log(`  ✓ Auto-replaced (${origCount} occurrence${origCount !== 1 ? "s" : ""})`);
      continue;
    }

    const answer = await rl.question("Replace? (Y/n): ");
    if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
      continue;
    }

    lines[lineIndex] = newLine;
    writeFileSync(file, lines.join(hasCRLF ? "\r\n" : "\n"), "utf-8");
    replaced++;
    console.log("  ✓ Replaced");
  }

  console.log(
    `\nDone. ${replaced} replaced, ${skipped} skipped (lines without old translated word).`,
  );
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
