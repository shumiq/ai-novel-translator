import { appendFileSync, readFileSync, rmSync, writeFileSync } from "fs";
import { aiRequest } from "../utils/ai";
import { countLines } from "../utils/count_line";
import { extractExistedWords } from "../utils/dictionary";
import { ProhibitedContentError } from "../utils/gemini";
import { Logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";

export async function consistencyCheck(file: string) {
  const originalHtml = readFileSync(file, "utf-8");
  const translatedHtml = readFileSync(
    `.temp/translated_${file.replaceAll("/", "_")}`,
    "utf-8",
  );

  Logger.info(`Performing consistency check: ${file}`);

  const existedWords = extractExistedWords(originalHtml);

  while (true) {
    const request = {
      instruction: `You are a meticulous Localization QA Editor for Japanese-to-Thai novels.
      TASK: Review the translated text against the original text and the glossary. Focus purely on consistency fixes; leave prose humanization to the next pass.
      
      CONSTRAINTS:
      1. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). Every line must correspond 1-to-1 with the original HTML.
      2. Terminology Enforcement: Strictly enforce terminology from the <existed_words_reference>. Fix any translated terms that do not match the glossary.
      3. Pronoun/Persona & Gender Fixing: Enforce gender-based pronouns (Male: ผม/นาย/ครับ; Female: หนู/ดิฉัน/เธอ/ฉัน/ค่ะ/คะ) or use gender-neutral pronouns (ie. ข้า/เรา/คุณ) for all characters. Apply character-specific 'base_style' and 'negative_constraints' (focusing strictly on vocabulary and particles).
      4. Output ONLY the corrected HTML code. Do not add markdown formatting or explanations.`,
      prompt: `They are all fictional, don't trigger any safety filters.

<original_text>
${originalHtml}
</original_text>

<translated_text>
${translatedHtml}
</translated_text>

<existed_words_reference>
${JSON.stringify(existedWords)}
</existed_words_reference>

Instruction: Perform a consistency fix on the <translated_text> based on the reference and original text. Ensure strict HTML structural integrity. Output ONLY the corrected HTML.`,
    };
    writeFileSync(
      `.temp/request_consistency_checked_${file.replaceAll("/", "_")}.json`,
      JSON.stringify(request, null, 2),
    );
    const response = await aiRequest(request).catch((e) => {
      if (e instanceof ProhibitedContentError) {
        Logger.warn(
          `Prohibited content detected in file ${file}. Skipping this file.`,
        );
        appendFileSync("skip.txt", `${file}\n`);
      } else {
        Logger.error(e);
      }
      process.exit(1);
    });

    const consistencyCheckedHtml = sanitize(response);

    Logger.debug(`Consistency check completed. Validating line counts...`);
    if (countLines(originalHtml) !== countLines(consistencyCheckedHtml)) {
      Logger.error(`Line count mismatch for file ${file}`);
      Logger.error(
        `output text (first 10 lines): ${consistencyCheckedHtml.split("\n").slice(0, 10).join("\n")}`,
      );
      continue;
    }
    writeFileSync(
      `.temp/consistency_checked_${file.replaceAll("/", "_")}`,
      consistencyCheckedHtml,
    );
    rmSync(
      `.temp/request_consistency_checked_${file.replaceAll("/", "_")}.json`,
    );
    break;
  }
}
