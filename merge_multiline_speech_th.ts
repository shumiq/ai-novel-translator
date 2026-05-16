import { Glob } from "bun";
import { readFileSync, writeFileSync } from "fs";
import { isThai } from "./utils/lang";
import { Logger } from "./utils/logger";

const glob = new Glob("books/**/*html");
const files = Array.from(glob.scanSync(".")) as string[];

files.forEach((file) => {
  const rawHTML = readFileSync(file, "utf-8");
  if (!isThai(rawHTML)) return;

  const lines = rawHTML.split("\n");
  const result: string[] = [];
  let i = 0;
  let notClosedLines = [] as number[];
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmedLine = line.trim();
    const openQuoteCount = (trimmedLine.match(/"/g) || []).length;
    if (openQuoteCount % 2 !== 0) {
      // 1. Strip the <p> tags from the first line immediately
      let mergedContent = trimmedLine.replace(/<\/?p>/g, "");
      i++;

      let hasClosed = false;
      notClosedLines.push(i); // Keep track of lines that are not closed
      while (i < lines.length) {
        const nextLine = (lines[i] ?? "").trim();

        // 2. Strip tags from subsequent lines and merge
        mergedContent = mergedContent + " " + nextLine.replace(/<\/?p>/g, "");

        const mergedQuoteCount = (mergedContent.match(/"/g) || []).length;
        if (mergedQuoteCount % 2 === 0) {
          hasClosed = true;
          break;
        }
        i++;
      }

      if (!hasClosed && i >= lines.length) {
        Logger.warn(
          `\nUnmatched quotes in file: ${file} starting at line ${notClosedLines.join(", ")}.`,
        );
        return;
      }

      // 3. Wrap the clean content in a single set of tags
      result.push(`<p>${mergedContent}</p>`);
      i++;
      continue;
    }
    result.push(line ?? "");
    i++;
  }

  writeFileSync(file, result.join("\n"));
  Logger.progress(`Processed ${file}`);
});
