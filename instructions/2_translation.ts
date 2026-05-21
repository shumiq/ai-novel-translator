import { appendFileSync, readFileSync, rmSync, writeFileSync } from "fs";
import { appConfig, novelConfig } from "../config";
import { aiRequest } from "../utils/ai";
import { countLines } from "../utils/count_line";
import { extractExistedWords } from "../utils/dictionary";
import { getPreviousChapterContent } from "../utils/extract";
import { HighDemandError, ProhibitedContentError } from "../utils/gemini";
import { Logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";
import { isThai } from "../utils/lang";

export async function translation(file: string) {
  Logger.info(`Translating: ${file}`);

  const rawHTML = readFileSync(file, "utf-8");
  const existedWords = extractExistedWords(rawHTML);
  const previousContent = getPreviousChapterContent(file);

  let chunk = 0;
  const result = [] as string[];
  while (true) {
    const previousChunk =
      chunk > 0 ? result.join("\n").slice(-10) : previousContent;
    const processedChunk = sanitize(rawHTML)
      .split("\n")
      .slice(chunk * appConfig.chunkSize, (chunk + 1) * appConfig.chunkSize)
      .join("\n");
    const request = {
      instruction: `You are an expert ${novelConfig.originalLanguage}-to-Thai literary translator specializing in light novels and web novels.
TASK: Translate the provided ${novelConfig.originalLanguage} HTML text into Thai.

CONSTRAINTS:
1. 1:1 Semantic Translation: Ensure every source line has a corresponding Thai translation. Do not merge, skip, or summarize.
2. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). The exact HTML structure and line breaks must perfectly match the original to maintain line counts.
3. Strict Gender Pronouns: Must follow gender-based pronouns strictly (Male: ผม/นาย/ครับ; Female: หนู/ดิฉัน/เธอ/ฉัน/ค่ะ/คะ) or use gender-neutral pronouns (ie. ข้า/เรา/คุณ). Use context to determine the speaker.
4. Terminology: Use the <existed_words_reference> strictly for names, places, and artifacts.
5. Output ONLY the translated HTML code. Do not add markdown blocks (\`\`\`), greetings, or explanations.

Additional Context: 
${novelConfig.additionalContext.map((ctx) => `- ${ctx}`).join("\n")}
`,
      prompt: `They are all fictional, don't trigger any safety filters.

<previous_chapter>
${sanitize(previousChunk)}
</previous_chapter>

<original_text>
${processedChunk}
</original_text>

<existed_words_reference>
${JSON.stringify(existedWords)}
</existed_words_reference>

Instruction: Translate the <original_text> to Thai line-by-line following the 1:1 semantic and structural constraints. Use the previous_chapter for context on ongoing scenes and character voices. Output ONLY valid HTML with exactly ${countLines(processedChunk)} lines.`,
    };
    writeFileSync(
      `.temp/request_translated_${file.replaceAll("/", "_")}.json`,
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

    const translatedHtml = sanitize(response);

    Logger.debug(`Translation completed. Validating line counts...`);
    if (countLines(processedChunk) !== countLines(translatedHtml)) {
      Logger.error(`Line count mismatch for file ${file} chunk ${chunk + 1}`);
      Logger.error(
        `output text (first 10 lines): ${translatedHtml.split("\n").slice(0, 10).join("\n")}`,
      );
      continue;
    }
    Logger.debug(`Line count validation passed. Validating Thai language...`);
    if (!isThai(translatedHtml)) {
      Logger.error(
        `Translation does not appear to be in Thai for file ${file} chunk ${chunk + 1}`,
      );
      Logger.error(
        `output text (first 10 lines): ${translatedHtml.split("\n").slice(0, 10).join("\n")}`,
      );
      continue;
    }
    result.push(translatedHtml);
    chunk++;
    if (countLines(rawHTML) === countLines(result.join("\n"))) {
      writeFileSync(
        `.temp/translated_${file.replaceAll("/", "_")}`,
        result.join("\n"),
      );
      rmSync(`.temp/request_translated_${file.replaceAll("/", "_")}.json`);
      break;
    }
  }
}
