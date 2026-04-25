import { execSync } from "child_process";
import { readFileSync } from "fs";
import { config } from "./config";
import { extractThai } from "./utils/extract";
import { isJapanese } from "./utils/lang";
import { Logger } from "./utils/logger";

function getJapaneseLines(text: string) {
  return text
    .split("\n")
    .map((line, i) => (line.trim() !== "" && isJapanese(line) ? i + 1 : null))
    .filter(Boolean) as number[];
}

const files = extractThai();
const toBeTranslated: string[] = [];

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const japaneseLines = getJapaneseLines(content);
  if (japaneseLines.length === 0) continue;
  toBeTranslated.push(` - ${file} at line: ${japaneseLines.join(", ")}`)
}

if(toBeTranslated.length === 0) {
  Logger.info(`No leftover Japanese text found.`)
  process.exit(0)
}

console.log(`Translate leftover japanese text of below files:`)
console.log(toBeTranslated.join("\n"))
console.log(`Don't write any code. Only edit specify lines.`)