import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { appConfig, novelConfig } from "../config";
import {
  aiRequest,
  HighDemandError,
  ProhibitedContentError,
} from "../utils/ai";
import { countLines } from "../utils/count_line";
import { extractExistedWords } from "../utils/dictionary";
import { getPreviousChapterContent } from "../utils/extract";
import { Logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";
import { validate } from "../utils/validate";

export async function translation(file: string) {
  if (!existsSync(".temp")) mkdirSync(".temp");
  Logger.info(`Translating: ${file}`);

  const rawHTML = readFileSync(file, "utf-8");
  const existedWords = extractExistedWords(rawHTML);
  const previousContent = getPreviousChapterContent(file);

  let chunk = 0;
  let chunkOffset = 0;
  let result = [] as string[];
  let validationError: string | null = null;
  let validationRetries = 0;
  while (true) {
    const rawLines = sanitize(rawHTML).split("\n");
    const chunkStart = chunk * appConfig.chunkSize + chunkOffset;
    const chunkEnd = Math.min(
      (chunk + 1) * appConfig.chunkSize,
      rawLines.length,
    );
    const processedChunk = rawLines.slice(chunkStart, chunkEnd).join("\n");
    if (processedChunk.length === 0) {
      Logger.info(
        `No more content to translate. Ending process for ${file}. Restarting from the beginning of the file to check for any missed content.`,
      );
      chunk = 0;
      chunkOffset = 0;
      validationError = null;
      validationRetries = 0;
      result = [];
      continue;
    }
    Logger.debug(`  Chunk ${chunk + 1} (lines ${chunkStart + 1}-${chunkEnd})`);
    const previousChunk =
      chunk > 0
        ? result.slice(-appConfig.previousChunk).join("\n")
        : previousContent;
    const request = {
      instruction: `You are an expert ${novelConfig.originalLanguage}-to-Thai literary translator specializing in light novels and web novels.
TASK: Translate the provided ${novelConfig.originalLanguage} HTML text into Thai.

CONSTRAINTS:
1. 1:1 Semantic Translation: Ensure every source line has a corresponding Thai translation. Do not merge, skip, or summarize.
2. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). The exact HTML structure and line breaks must perfectly match the original to maintain line counts.
3. Strict Gender Pronouns: Must follow gender-based pronouns strictly (Male: ผม/นาย/ครับ; Female: หนู/ดิฉัน/เธอ/ฉัน/ค่ะ/คะ) or use gender-neutral pronouns (ie. ข้า/เรา/คุณ). Use context to determine the speaker.
4. Terminology: Use the <existed_words_reference> strictly for names, places, and artifacts.
5. No Parentheses: Do not add parentheses in translations unless the original text contains parentheses.
6. Keep all HTML escaping intact (e.g., &amp;, &lt;, &gt;). Do not convert them back to symbols.
7. Output ONLY the translated HTML code. Do not add markdown blocks (\`\`\`), greetings, or explanations.

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

${validationError ? `<feedback>\n${validationError}\n</feedback>\n\n` : ""}Instruction: Translate the <original_text> to Thai line-by-line following the 1:1 semantic and structural constraints. Use the previous_chapter for context on ongoing scenes and character voices. Output ONLY valid HTML with exactly ${countLines(processedChunk)} lines.`,
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
        appendFileSync(".temp/skip.txt", `${file}\n`);
      } else if (e instanceof HighDemandError) {
        Logger.warn(
          `High demand detected in file ${file}. Skipping this file.`,
        );
        appendFileSync(".temp/skip.txt", `${file}\n`);
      } else {
        Logger.error(e);
      }
      throw e;
    });

    const translatedHtml = sanitize(response);

    Logger.debug(`  └─ validating...`);
    const translationError = validate(
      processedChunk,
      translatedHtml,
      `file ${file} chunk ${chunk + 1}`,
    );
    if (translationError) {
      validationRetries++;
      Logger.debug(
        `  └─ validation failed, attempt ${validationRetries} (line ${translationError.match(/at line (\d+)/)?.[1] ?? "?"})`,
      );
      if (
        appConfig.validation.retriesLimit &&
        validationRetries > appConfig.validation.retriesLimit
      ) {
        Logger.warn(
          `Validation failed ${appConfig.validation.retriesLimit} times for ${file}. Skipping this file.`,
        );
        appendFileSync(".temp/skip.txt", `${file}\n`);
        throw new Error(
          `Validation failed for ${file} after ${validationRetries} retries`,
        );
      }
      const lineMatch = translationError.match(/at line (\d+)/);
      const failLine = lineMatch?.[1] ? parseInt(lineMatch[1]) : 1;
      const keepUntil = Math.max(0, failLine - 10);
      if (keepUntil > 0) {
        const responseLines = translatedHtml.split("\n");
        const keptLines = responseLines.slice(0, keepUntil);
        result.push(keptLines.join("\n"));
        chunkOffset = keepUntil;
      }
      validationError = translationError;
      continue;
    } else {
      validationError = null;
      validationRetries = 0;
    }
    result.push(...translatedHtml.split("\n"));
    chunk++;
    chunkOffset = 0;
    Logger.debug(`  └─ chunk done (${result.length}/${rawLines.length} lines)`);
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
