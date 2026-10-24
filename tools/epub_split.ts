// Name: EPUB Split
// Description: Split large EPUB files into smaller parts at separator boundaries
import { readFileSync, unlinkSync, writeFileSync } from "fs";
import { appConfig } from "../config";
import { extractNonThai, extractThai } from "../utils/extract";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A separator line holds only ONE kind of separator character (whitespace ignored):
// "◇　◇　◇" splits, "◇　◇　◇ ***" is mixed and does not.
export function isSeparatorLine(line: string, separators: string[]) {
  const content = line.replace(/^<p>/, "").replace(/<\/p>$/, "");
  return separators.some((s) =>
    new RegExp(`^\\s*(?:${escapeRegex(s)}\\s*)+$`).test(content),
  );
}

export function epubSplit() {
  const files = appConfig.pipeline.includes("translation")
    ? extractNonThai()
    : extractThai();
  const separatorPatterns = appConfig.epub_seprarator;
  let splitCount = 0;

  for (const file of files) {
    const rawHTML = readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const lines = rawHTML.split("\n");

    const isSeparator = (line: string) =>
      isSeparatorLine(line, separatorPatterns);

    const splitPoints: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (isSeparator(lines[i]!)) {
        splitPoints.push(i);
      }
    }

    if (splitPoints.length === 0) continue;

    const ext = file.split(".").pop()!;
    const baseName = file.slice(0, -(ext.length + 1));

    const allSplitIndices = [0, ...splitPoints, lines.length];
    const parts: string[][] = [];

    for (let i = 0; i < allSplitIndices.length - 1; i++) {
      const start = allSplitIndices[i]!;
      const end = allSplitIndices[i + 1]!;
      const partLines = lines
        .slice(start, end)
        .filter((line) => !isSeparator(line));
      if (partLines.some((l) => l.trim())) {
        parts.push(partLines);
      }
    }

    for (let i = 0; i < parts.length; i++) {
      const partPath = `${baseName}.part_${i + 1}.${ext}`;
      writeFileSync(partPath, parts[i]!.join("\n"));
    }

    unlinkSync(file);
    splitCount++;
  }

  return splitCount;
}

if (import.meta.main) {
  const seps = appConfig.epub_seprarator;
  console.assert(isSeparatorLine("<p>◇　◇　◇</p>", seps));
  console.assert(isSeparatorLine("<p>* * *</p>", seps));
  console.assert(!isSeparatorLine("<p>◇　◇　◇ ***</p>", seps));
  console.assert(!isSeparatorLine("<p>text ◇ text</p>", seps));

  const count = epubSplit();
  console.log(`Split ${count} file(s)`);
}
