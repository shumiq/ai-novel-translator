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

for (const file of files) {
  while (true) {
    const content = readFileSync(file, "utf-8");
    const japaneseLines = getJapaneseLines(content);
    if (japaneseLines.length === 0) break;
    const prompt = `Translate leftover japanese text of the file @${file} to thai at lines ${japaneseLines.join(", ")}. Only using internel read/write tools in Windows environment. Don't write any code.`;
    Logger.info(prompt);
    execSync(`gemini --yolo --prompt "${prompt}" --model ${config.model}`, {
      stdio: "inherit",
      timeout: 1000 * 60 * 10,
      killSignal: "SIGKILL",
    });
  }
}
