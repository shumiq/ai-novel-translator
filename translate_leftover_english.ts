import { readFileSync } from "fs";
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

const files = extractThai();
const toBeTranslated: string[] = [];

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const englishLines = getEnglishLines(content);
  if (englishLines.length === 0) continue;
  toBeTranslated.push(` - ${file} at line: ${englishLines.join(", ")}`);
}

if (toBeTranslated.length === 0) {
  Logger.info(`No leftover English text found.`);
  process.exit(0);
}

console.log(`Translate leftover English text of below files:`);
console.log(toBeTranslated.join("\n"));
console.log(`Don't write any code. Only edit specify lines.`);
