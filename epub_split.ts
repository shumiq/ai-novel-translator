import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { appConfig } from "./config";
import { extractNonThai } from "./utils/extract";

export function epubSplit() {
  const files = extractNonThai();
  const separatorPatterns = appConfig.epub_seprarator;
  let splitCount = 0;

  for (const file of files) {
    const rawHTML = readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const lines = rawHTML.split("\n");

    const separatorRegex = new RegExp(
      `^<p>(${separatorPatterns.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})</p>$`,
    );

    const splitPoints: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (separatorRegex.test(lines[i]!)) {
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
        .filter((line) => !separatorRegex.test(line));
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
  const count = epubSplit();
  console.log(`Split ${count} file(s)`);
}
