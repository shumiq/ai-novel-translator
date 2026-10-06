// Name: Fix Quotes
// Description: Fix whole-line quote wrapping discrepancies between original and translated chapter
// Usage: bun tools/fix_quotes.ts <episode>
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { novelConfig } from "../config";
import { Logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";
import { extractLinesFromHtml } from "../utils/text";

const episode = process.argv[2];

if (!episode) {
  Logger.error("Usage: bun tools/fix_quotes.ts <episode>");
  process.exit(1);
}

const src = join(novelConfig.originalPath, `${episode}.json`);
const htmlPath = join("./books", `${episode}.html`);

if (!novelConfig.originalPath || !existsSync(novelConfig.originalPath)) {
  Logger.error(`Original path does not exist: ${novelConfig.originalPath}`);
  process.exit(1);
}

if (!existsSync(src)) {
  Logger.error(`Source file does not exist: ${src}`);
  process.exit(1);
}

if (!existsSync(htmlPath)) {
  Logger.error(`Translated file does not exist: ${htmlPath}`);
  process.exit(1);
}

// Original content, sanitized once (「」『』 become ")
const original = JSON.parse(readFileSync(src, "utf-8")) as { content: string };
const originalLines = extractLinesFromHtml(
  sanitize(
    extractLinesFromHtml(original.content)
      .map((line) => `<p>${line}</p>`)
      .join("\n"),
  ),
);

const translatedLines = readFileSync(htmlPath, "utf-8").split("\n");

// Translated file starts with the chapter title, original content does not
const offset = translatedLines.length === originalLines.length + 1 ? 1 : 0;

if (translatedLines.length - offset !== originalLines.length) {
  Logger.warn(
    `Line count mismatch: original ${originalLines.length}, translated ${translatedLines.length - offset}. Comparing up to the shorter length.`,
  );
}

const P_LINE = /^<p>([\s\S]*)<\/p>$/;
const isWrapped = (line: string) =>
  line.length > 1 && line.startsWith('"') && line.endsWith('"');

let fixed = 0;

for (let i = 0; i < originalLines.length; i++) {
  const index = i + offset;
  const translated = translatedLines[index];
  const originalLine = originalLines[i];
  if (translated === undefined || originalLine === undefined) break;

  const match = translated.trim().match(P_LINE);
  if (!match) continue;
  const text = (match[1] ?? "").trim();

  const originalWrapped = isWrapped(originalLine);
  const translatedWrapped = isWrapped(text);

  // Only touch lines where the two disagree, or where a wrapped line needs normalizing
  if (originalWrapped === translatedWrapped && !translatedWrapped) continue;

  const body = translatedWrapped ? text.slice(1, -1).trim() : text;
  const replacement = originalWrapped ? `"${body}"` : body;
  if (replacement === text) continue;

  translatedLines[index] = `<p>${replacement}</p>`;
  fixed++;
  Logger.info(
    `Line ${index + 1}: ${originalWrapped ? "wrapped" : "unwrapped"}`,
  );
  Logger.info(`  before: ${text}`);
  Logger.info(`  after:  ${replacement}`);
}

if (fixed > 0) {
  writeFileSync(htmlPath, translatedLines.join("\n"));
  Logger.done(`Fixed ${fixed} line(s) in ${htmlPath}`);
} else {
  Logger.done(`No quote discrepancies found in ${htmlPath}`);
}
