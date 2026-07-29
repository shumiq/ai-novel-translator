import { appConfig } from "../config";
import { countLines } from "./count_line";
import { isThai } from "./lang";
import { Logger } from "./logger";
import { extractLinesFromHtml } from "./text";

export function isAlphabet(c: string): boolean {
  const char = c[0];
  if (!char) return false;
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Thai}\p{Script=Latin}]0123456789/u.test(
    char,
  );
}

export function validate(
  before: string,
  after: string,
  context?: string,
): string | null {
  const label = context ? ` for ${context}` : "";

  if (
    countLines(before) !== countLines(after) &&
    appConfig.validation.lineCount
  ) {
    const msg = `Line count mismatch${label}`;
    Logger.error(msg);
    Logger.error(
      `output text (first 10 lines): ${after.split("\n").slice(0, 10).join("\n")}`,
    );
    return msg;
  }

  if (!isThai(after) && appConfig.validation.isThai) {
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

    // Bad character check — extract text content from <p> tag and test against BAD_CHAR_RE
    if (appConfig.validation.badCharacter) {
      const afterText = afterLine.replace(/<[^>]+>/g, "").trim();
      const matches = afterText.match(BAD_CHAR_RE);
      if (matches) {
        const uniqueChars = [...new Set(matches)]
          .map(
            (c) =>
              `"${c}" (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`,
          )
          .join(", ");
        Logger.warn(`Line ${i + 1}${label}: ${uniqueChars}`);
        Logger.info(`  ${afterText}`);
        const msg = `Bad character(s) found at line ${i + 1}${label}`;
        Logger.error(msg);
        return msg;
      }
    }

    // original
    // const countQuotesAndBrackets = (s: string) =>
    //   (s.match(/["''""'\[\]【】｛｝{}〔〕〈〉《》「」『』〝〟«»]/g) || [])
    //     .length;
    const countQuotesAndBrackets = (s: string) =>
      (s.match(/["\[\]【】｛｝{}〔〕〈〉《》「」『』〝〟«»]/g) || []).length;
    const countParens = (s: string) => (s.match(/[\(\)（）]/g) || []).length;

    if (
      countQuotesAndBrackets(beforeLine) !==
        countQuotesAndBrackets(afterLine) &&
      appConfig.validation.quouteCount
    ) {
      const msg = `Bracket/quote count mismatch at line ${i + 1}${label}: original has ${countQuotesAndBrackets(beforeLine)}, translated has ${countQuotesAndBrackets(afterLine)}`;
      Logger.error(msg);
      return msg;
    }

    if (
      countParens(afterLine) > countParens(beforeLine) &&
      appConfig.validation.parenthesesCount
    ) {
      const msg = `Parenthesis count mismatch at line ${i + 1}${label}: original has ${countParens(beforeLine)}, translated has ${countParens(afterLine)}`;
      Logger.error(msg);
      return msg;
    }

    if (
      beforeChar !== undefined &&
      afterChar !== undefined &&
      isAlphabet(beforeChar) !== isAlphabet(afterChar) &&
      appConfig.validation.startCharacter
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

// Characters we explicitly allow:
// - Thai script
// - Latin (English) letters
// - ASCII digits
// - Common ASCII punctuation: !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~
// - Unicode punctuation: …‥–—― ‼⁉‽ー
// - Smart/curly quotes: ' ' " " ‹› «»
// - CJK punctuation: 、。・゛゜゠〜「」『』【】〔〕〈〉《》〖〗◤◢
// - CJK/fullwidth variants: ＊＋－＝／＜＞＃＆％
// - Math symbols: +−±×÷=≒≠≡≦≧≪≫∞∇∮∝√∂∫∑∏∠⊥∴∵≣≈
// - Arrows: ←↑→↓↔↕⇒⇔
// - Shapes: ○●◎◇◆□■△▲▽▼★☆✦✧♡
// - Kaomoji / decorative faces: ᗜ╹ㅂ
// - Playing card suits: ♠♣♥♦
// - Music notes: ♪♩♫♬
// - Superscripts: ¹²³⁴⁵⁶⁷⁸⁹⁰
// - Subscripts: ₀₁₂₃₄₅₆₇₈₉
// - Circled numbers: ①-⑳
// - Parenthesized numbers: ㉑-㉟
// - Circled ideographs: ㊱-㊿
// - Currency: $¢£¥€₩฿₽₹￡
// - Legal/branding: ©®™℗℠℡
// - Miscellaneous: °·′″µ№※ℹℓ℃℉♂♀♰￥⇨
export const BAD_CHAR_RE =
  /[^\p{Script=Thai}\p{Script=Latin}0-9 \t!"#%&'\(\)\*\+,\-\.\/:;<=>\?@\[\\\]^_`{|}~¡¢£¥¦©®°±·¹²³⁴⁵⁶⁷⁸⁹⁰µ×÷‐–—―ー…‥‼⁉ ′″‵‶‷‸‹›※‼⁽⁾₀₁₂₃₄₅₆₇₈₉€฿₩₽₹￡℃℉№™℗℠℡ℓ♠♣♥♦♪♩♫♬♡○●◎◇◆□■△▲▽▼★☆✦✧←↑→↓↔↕⇒⇔αβγδεζηθικλμνξοπρςστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ∇∝∞∟∠∡∢∣∥∧∨∩∪∫∬∭∮∵∴≈≒≠≡≣≤≥≦≧≪≫⊂⊃⊆⊇⊥∂√∑∏＊＋－／＝＜＞＃＆％゛゜゠〜「」〖〗『』【】〔〕〈〉《》◤◢、・•´ˊˋ｀̀́ㅂ╹ᗜ\u2460-\u2473\u3251-\u325F\u32B1-\u32BF─♂♀♰￥⇨]/gu;

/**
 * Check HTML content for characters that fall outside the allowed set.
 * Logs warnings for each issue found, with the line number and characters.
 *
 * @param content - The HTML content (with `<p>` tags) to check.
 * @param context - Optional label for error messages (e.g. file name).
 * @returns `null` if no bad characters found, or an error message string.
 */
export function checkBadCharacters(
  content: string,
  context?: string,
): string | null {
  const label = context ? ` in ${context}` : "";
  if (!isThai(content)) return null;
  const lines = extractLinesFromHtml(content);
  let issues = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const matches = line.match(BAD_CHAR_RE);
    if (matches) {
      const uniqueChars = [...new Set(matches)]
        .map(
          (c) =>
            `"${c}" (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`,
        )
        .join(", ");
      Logger.warn(`${context ?? "content"}:${i + 1}: ${uniqueChars}`);
      Logger.info(`  ${line}`);
      issues++;
    }
  }

  if (issues > 0) {
    const msg = `Found ${issues} line(s) with bad characters${label}`;
    Logger.error(msg);
    return msg;
  }
  return null;
}
