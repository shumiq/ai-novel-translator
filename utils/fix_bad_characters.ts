// Name: Fix Bad Characters
// Description: Scan Thai HTML files for bad/unwanted characters and return structured results
import { readFileSync } from "fs";
import { extractThai } from "./extract";
import { Logger } from "./logger";
import { extractLinesFromHtml } from "./text";
import { BAD_CHAR_RE, MIXED_SCRIPT_RE } from "./validate";

export interface BadCharIssue {
  line: number;
  badChars: string[];
  mixedScriptPairs: string[];
  originalLine: string;
}

export interface BadCharResult {
  file: string;
  issues: BadCharIssue[];
}

/**
 * Scan a single file for bad characters.
 * Returns an array of issues found (one per line).
 */
function scanFileForBadChars(file: string): BadCharIssue[] {
  const content = readFileSync(file, "utf-8");
  const lines = extractLinesFromHtml(content);
  const issues: BadCharIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const badChars = line.match(BAD_CHAR_RE);
    const mixedPairs = line.match(MIXED_SCRIPT_RE);

    if (badChars || mixedPairs) {
      issues.push({
        line: i + 1,
        badChars: badChars ? [...new Set(badChars)] : [],
        mixedScriptPairs: mixedPairs ? [...new Set(mixedPairs)] : [],
        originalLine: line,
      });
    }
  }

  return issues;
}

/**
 * Scan all Thai files for bad characters.
 * Returns results for files that have issues.
 */
export function scanAllFilesForBadChars(): BadCharResult[] {
  const files = extractThai();
  Logger.info(`Scanning ${files.length} Thai files for bad characters...`);

  const results: BadCharResult[] = [];

  for (const file of files) {
    const issues = scanFileForBadChars(file);
    if (issues.length > 0) {
      results.push({ file, issues });
    }
  }

  return results;
}
