// Name: EPUB Join
// Description: Join split EPUB part files (part_1, part_2, etc.) back into single files
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { Glob } from "bun";
import { appConfig } from "../config";

const PART_RE = /^(.+)\.part_(\d+)\.(html|xhtml)$/;

export function epubJoin() {
  const glob = new Glob("books/**/*.part_*.*");
  const partFiles = Array.from(glob.scanSync(".")).map((f) =>
    f.replaceAll("\\", "/"),
  );

  const groups: Record<string, string[]> = {};
  for (const file of partFiles) {
    const match = file.match(PART_RE);
    if (!match) continue;
    const base = match[1]!;
    const index = Number(match[2]);
    if (!groups[base]) groups[base] = [];
    groups[base]![index - 1] = file;
  }

  let joinCount = 0;

  for (const [base, parts] of Object.entries(groups)) {
    const validParts = parts.filter(Boolean) as string[];
    if (validParts.length === 0) continue;

    const ext = validParts[0]!.match(PART_RE)![3];
    const allLines: string[] = [];
    for (const part of validParts) {
      const content = readFileSync(part, "utf-8").replace(/\r\n/g, "\n");
      allLines.push(content);
    }

    const originalPath = `${base}.${ext}`;
    writeFileSync(
      originalPath,
      allLines.join(`\n<p>${appConfig.epub_seprarator[0]}</p>\n`),
    );

    for (const part of validParts) {
      unlinkSync(part);
    }

    joinCount++;
  }

  return joinCount;
}

if (import.meta.main) {
  const count = epubJoin();
  console.log(`Joined ${count} file(s)`);
}
