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
  const originalHtml = readFileSync(file, "utf-8");
  const previousContent = getPreviousChapterContent(file);

  Logger.info(`Performing humanization: ${file}`);

  const existedWords = extractExistedWords(originalHtml);
  const consistencyCheckedHTML = readFileSync(getSourceFile(file), "utf-8");

  let chunk = 0;
  let chunkOffset = 0;
  const result = [] as string[];
  let validationError: string | null = null;
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
    const previousChunk =
      chunk > 0
        ? result.slice(-appConfig.previousChunk).join("\n")
        : previousContent;
    const request = {
      instruction: `You are a highly skilled Native Thai Novelist and Literary Editor.
TASK: Humanize and polish the translated Thai text so it reads naturally, beautifully, and emotionally, like a published novel.

CONSTRAINTS:
1. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). The exact line count and tag structure must perfectly match the original text.
2. Naturalize Sentences: Fix literal translations that sound robotic or unnatural in Thai. Rearrange awkward sentence structures to read smoothly.
3. Artifact & Clutter Eradication: Remove all leftover ${novelConfig.originalLanguage} characters/punctuation (e.g., 、 , 。) and eliminate redundant bracketed translations (e.g., change 'พล็อตคลาสสิก (Template)' to just 'พล็อตคลาสสิก').
4. Dialogue & Particle Optimization: Ensure dialogue flows like a real Thai conversation. Reduce repetitive particles (e.g., ending every single sentence with "ครับ/ค่ะ/จ๊ะ") and simplify excessive Royal Vocabulary (คำราชาศัพท์ไทย) for modern readability.
5. Fix Word Choice: Replace unnatural word choices with idiomatic Thai expressions while keeping the <existed_words_reference> terminology intact.
6. No Parentheses: Do not add parentheses in translations unless the original text contains parentheses.
7. Keep all HTML escaping intact (e.g., &amp;, &lt;, &gt;). Do not convert them back to symbols.
8. Output ONLY the polished HTML code. No markdown tags, no conversational filler.

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

${validationError ? `<feedback>\n${validationError}\n</feedback>\n\n` : ""}Instruction: Rewrite and humanize the <translated_text> for superior Thai literary flow while maintaining flawless structural integrity. Use the previous_chapter to maintain narrative continuity and character voice consistency. Output ONLY the finalized HTML with exactly ${countLines(translatedChunk)} lines.`,
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

    const humanizedHtml = sanitize(response);

    Logger.debug(`Humanization completed. Validating...`);
    const humanizationError = validate(
      translatedChunk,
      humanizedHtml,
      `file ${file} chunk ${chunk + 1}`,
    );
    if (humanizationError) {
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
    }
    result.push(humanizedHtml);
    chunk++;
    chunkOffset = 0;
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
