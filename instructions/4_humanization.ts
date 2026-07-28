import {
  appendFileSync,
  existsSync,
  mkdirSync,
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
  const files = [
    `.temp/consistency_checked_${file.replaceAll("/", "_")}`,
    `.temp/translated_${file.replaceAll("/", "_")}`,
    file,
  ];
  for (const file of files) {
    if (existsSync(file)) return file;
  }
  return file;
};

export async function humanization(file: string) {
  if (!existsSync(".temp")) mkdirSync(".temp");
  const originalHtml = readFileSync(file, "utf-8");
  const previousContent = getPreviousChapterContent(file);

  Logger.info(`Humanization: ${file}`);

  const isThaiPipeline =
    !appConfig.pipeline.includes("extraction") &&
    !appConfig.pipeline.includes("translation");
  const existedWords = extractExistedWords(
    originalHtml,
    isThaiPipeline ? { searchByThai: true, genderOnly: true } : undefined,
  );
  const consistencyCheckedHTML = readFileSync(getSourceFile(file), "utf-8");

  let chunk = 0;
  let chunkOffset = 0;
  let result = [] as string[];
  let validationError: string | null = null;
  let validationRetries = 0;
  while (true) {
    const originalLines = originalHtml.split("\n");
    const translatedLines = consistencyCheckedHTML.split("\n");
    const chunkStart = chunk * appConfig.chunkSize + chunkOffset;
    const chunkEnd = Math.min(
      (chunk + 1) * appConfig.chunkSize,
      originalLines.length,
    );
    const originalChunk = originalLines.slice(chunkStart, chunkEnd).join("\n");
    const translatedChunk = translatedLines
      .slice(chunkStart, chunkEnd)
      .join("\n");
    if (translatedChunk.length === 0 || countLines(translatedChunk) === 0) {
      Logger.info(
        `No more content to humanize. Ending process for ${file}. Restarting from the beginning of the file to check for any missed content.`,
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
      instruction: `You are a Thai native speaker helping clean up a machine-translated novel for personal reading. The goal is readability, NOT literary polish — just make it sound like natural, everyday Thai.

RULES:
1. NEVER change the line count or HTML tags (<p>). What goes in, same number of lines must come out.
2. Remove leftover ${novelConfig.originalLanguage} characters (e.g., 、 。) and unnecessary bracketed text like 'word (translation)' → just 'word'.
3. Fix awkward/stiff phrasing ONLY if it clearly sounds like a machine wrote it. If a sentence already reads fine, do NOT touch it.
4. Do NOT add words, embellish, or make sentences longer. Do NOT rewrite for style or beauty.
5. Do NOT add parentheses unless the original has them.
6. Keep HTML entities (&amp; &lt; &gt;) as-is.
7. Output ONLY the HTML. No explanations.

DIALOGUE & PARTICLES:
- Dialogue must sound like how real Thai people talk in casual conversation, not formal writing.
- Match particles to character gender: Male speakers use ครับ/นะ/วะ/เว้ย/etc. Female speakers use ค่ะ/คะ/สิ/ยะ/etc. If the character's gender is clear from context, use the correct set.
- Avoid overly formal/royal vocabulary (คำราชาศัพท์) in casual dialogue — use plain Thai instead.
- If a character ends every single line with the same particle (e.g., always ครับ), drop the particle on some lines to sound more natural. Real people don't repeat particles that consistently.
- Exclamations and reactions should sound punchy and conversational, not stiff.

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

${validationError ? `<feedback>\n${validationError}\n</feedback>\n\n` : ""}Instruction: Light cleanup of <translated_text> for personal readability. Fix only robotic phrasing and remove artifacts. If the text already reads naturally, keep it unchanged. Do NOT rewrite for style. Output ONLY the HTML with exactly ${countLines(translatedChunk)} lines.`,
    };
    writeFileSync(
      `.temp/request_final_humanized_${file.replaceAll("/", "_")}.json`,
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

    const humanizedHtml = sanitize(response);

    Logger.debug(`  └─ validating...`);
    const humanizationError = validate(
      translatedChunk,
      humanizedHtml,
      `file ${file} chunk ${chunk + 1}`,
    );
    if (humanizationError) {
      validationRetries++;
      Logger.debug(
        `  └─ validation failed, attempt ${validationRetries} (line ${humanizationError.match(/at line (\d+)/)?.[1] ?? "?"})`,
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
      const lineMatch = humanizationError.match(/at line (\d+)/);
      const failLine = lineMatch?.[1] ? parseInt(lineMatch[1]) : 1;
      const keepUntil = Math.max(0, failLine - 10);
      if (keepUntil > 0) {
        const responseLines = humanizedHtml.split("\n");
        const keptLines = responseLines.slice(0, keepUntil);
        result.push(keptLines.join("\n"));
        chunkOffset = keepUntil;
      }
      validationError = humanizationError;
      continue;
    } else {
      validationError = null;
      validationRetries = 0;
    }
    result.push(...humanizedHtml.split("\n"));
    chunk++;
    chunkOffset = 0;
    Logger.debug(
      `  └─ chunk done (${result.length}/${originalLines.length} lines)`,
    );
    if (countLines(consistencyCheckedHTML) === countLines(result.join("\n"))) {
      writeFileSync(
        `.temp/final_humanized_${file.replaceAll("/", "_")}`,
        result.join("\n"),
      );
      rmSync(`.temp/request_final_humanized_${file.replaceAll("/", "_")}.json`);
      break;
    }
  }
}
