import { Logger } from "./logger";
import { isThai } from "./lang";
import { countLines } from "./count_line";

export function isAlphabet(c: string): boolean {
  const char = c[0];
  if (!char) return false;
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Thai}\p{Script=Latin}]/u.test(
    char,
  );
}

export function validate(
  before: string,
  after: string,
  context?: string,
): string | null {
  const label = context ? ` for ${context}` : "";

  if (countLines(before) !== countLines(after)) {
    const msg = `Line count mismatch${label}`;
    Logger.error(msg);
    Logger.error(
      `output text (first 10 lines): ${after.split("\n").slice(0, 10).join("\n")}`,
    );
    return msg;
  }

  if (!isThai(after)) {
    const msg = `Output does not appear to be in Thai${label}`;
    Logger.error(msg);
    Logger.error(
      `output text (first 10 lines): ${after.split("\n").slice(0, 10).join("\n")}`,
    );
    return msg;
  }

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i++) {
    const beforeLine = beforeLines[i];
    const afterLine = afterLines[i];
    if (beforeLine === undefined || afterLine === undefined) continue;
    const beforeChar = beforeLine.match(/<p[^>]*>\s*(.)/)?.[1];
    const afterChar = afterLine.match(/<p[^>]*>\s*(.)/)?.[1];

    const countQuotesAndBrackets = (s: string) =>
      (s.match(/["''""'\[\]【】｛｝{}〔〕〈〉《》「」『』〝〟«»]/g) || [])
        .length;
    const countParens = (s: string) => (s.match(/[\(\)（）]/g) || []).length;

    if (
      countQuotesAndBrackets(beforeLine) !== countQuotesAndBrackets(afterLine)
    ) {
      const msg = `Bracket/quote count mismatch at line ${i + 1}${label}: original has ${countQuotesAndBrackets(beforeLine)}, translated has ${countQuotesAndBrackets(afterLine)}`;
      Logger.error(msg);
      return msg;
    }

    if (countParens(afterLine) > countParens(beforeLine)) {
      const msg = `Parenthesis count mismatch at line ${i + 1}${label}: original has ${countParens(beforeLine)}, translated has ${countParens(afterLine)}`;
      Logger.error(msg);
      return msg;
    }

    if (
      beforeChar !== undefined &&
      afterChar !== undefined &&
      isAlphabet(beforeChar) !== isAlphabet(afterChar)
    ) {
      const msg = `Starting character mismatch after <p> at line ${i + 1}${label}: expected '${beforeChar}' (isAlphabet=${isAlphabet(beforeChar)}), got '${afterChar}' (isAlphabet=${isAlphabet(afterChar)})`;
      Logger.error(msg);
      Logger.error(
        `output text (first 10 lines): ${after.split("\n").slice(0, 10).join("\n")}`,
      );
      return msg;
    }
  }

  return null;
}
