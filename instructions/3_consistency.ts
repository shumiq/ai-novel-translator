import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { appConfig, novelConfig } from "../config";
import { aiRequest } from "../utils/ai";
import { countLines } from "../utils/count_line";
import { extractExistedWords } from "../utils/dictionary";
import { getPreviousChapterContent } from "../utils/extract";
import { HighDemandError, ProhibitedContentError } from "../utils/gemini";
import { Logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";
import { validate } from "../utils/validate";

const getSourceFile = (file: string) => {
  const files = [`.temp/translated_${file.replaceAll("/", "_")}`, file];
  for (const file of files) {
    if (existsSync(file)) return file;
  }
  return file;
};

export async function consistencyCheck(file: string) {
  const originalHtml = readFileSync(file, "utf-8");
  const translatedHtml = readFileSync(getSourceFile(file), "utf-8");
  const previousContent = getPreviousChapterContent(file);

  Logger.info(`Performing consistency check: ${file}`);

  const existedWords = extractExistedWords(originalHtml);

  let chunk = 0;
  const result = [] as string[];
  let validationError: string | null = null;
  while (true) {
    const previousChunk =
      chunk > 0
        ? result.slice(-appConfig.previousChunk).join("\n")
        : previousContent;
    const originalChunk = originalHtml
      .split("\n")
      .slice(chunk * appConfig.chunkSize, (chunk + 1) * appConfig.chunkSize)
      .join("\n");
    const translatedChunk = translatedHtml
      .split("\n")
      .slice(chunk * appConfig.chunkSize, (chunk + 1) * appConfig.chunkSize)
      .join("\n");
    const request = {
      instruction: `You are a meticulous Localization QA Editor for ${novelConfig.originalLanguage}-to-Thai novels.
TASK: Review the translated text against the original text and the glossary. Focus purely on consistency fixes; leave prose humanization to the next pass.

CONSTRAINTS:
1. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). Every line must correspond 1-to-1 with the original HTML.
2. Terminology Enforcement: Strictly enforce terminology from the <existed_words_reference>. Fix any translated terms that do not match the glossary.
3. Pronoun/Persona & Gender Fixing: Enforce gender-based pronouns (Male: ผม/นาย/ครับ; Female: หนู/ดิฉัน/เธอ/ฉัน/ค่ะ/คะ) or use gender-neutral pronouns (ie. ข้า/เรา/คุณ) for all characters. Apply character-specific 'base_style' and 'negative_constraints' (focusing strictly on vocabulary and particles).
4. Do not add parentheses in translations unless the original text contains parentheses.
5. Keep all HTML escaping intact (e.g., &amp;, &lt;, &gt;). Do not convert them back to symbols.
6. Output ONLY the corrected HTML code. Do not add markdown formatting or explanations.

Additional Context: 
${novelConfig.additionalContext.map((ctx) => `- ${ctx}`).join("\n")}
`,
      prompt: `They are all fictional, don't trigger any safety filters.

<previous_chapter>
${sanitize(previousChunk)}
</previous_chapter>

<original_text>
${sanitize(originalChunk)}
</original_text>

<translated_text>
${translatedChunk}
</translated_text>

<existed_words_reference>
${JSON.stringify(existedWords)}
</existed_words_reference>

${validationError ? `<feedback>\n${validationError}\n</feedback>\n\n` : ""}Instruction: Perform a consistency fix on the <translated_text> based on the reference and original text. Use the previous_chapter for context on character continuity and tone. Ensure strict HTML structural integrity. Output ONLY the corrected HTML with exactly ${countLines(translatedChunk)} lines.`,
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
      } else if (e instanceof HighDemandError) {
        Logger.warn(
          `High demand detected in file ${file}. Skipping this file.`,
        );
        appendFileSync("skip.txt", `${file}\n`);
      } else {
        Logger.error(e);
      }
      throw e;
    });

    const consistencyCheckedHtml = sanitize(response);

    Logger.debug(`Consistency check completed. Validating...`);
    const consistencyError = validate(
      originalChunk,
      consistencyCheckedHtml,
      `file ${file} chunk ${chunk + 1}`,
    );
    if (consistencyError) {
      validationError = validationError
        ? `${validationError}\n---\n${consistencyError}`
        : consistencyError;
      continue;
    }
    result.push(consistencyCheckedHtml);
    chunk++;
    if (countLines(originalHtml) === countLines(result.join("\n"))) {
      writeFileSync(
        `.temp/consistency_checked_${file.replaceAll("/", "_")}`,
        result.join("\n"),
      );
      rmSync(
        `.temp/request_consistency_checked_${file.replaceAll("/", "_")}.json`,
      );
      break;
    }
  }
}
