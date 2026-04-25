import { appendFileSync, readFileSync, rmSync, writeFileSync } from "fs";
import { config } from "../config";
import { aiRequest } from "../utils/ai";
import { countLines } from "../utils/count_line";
import { extractExistedWords } from "../utils/dictionary";
import { ProhibitedContentError } from "../utils/gemini";
import { Logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";

export async function humanization(file: string) {
  const originalHtml = readFileSync(file, "utf-8");

  Logger.info(`Performing humanization: ${file}`);

  const existedWords = extractExistedWords(originalHtml);

  while (true) {
    const consistencyCheckedHTML = readFileSync(
      `.temp/consistency_checked_${file.replaceAll("/", "_")}`,
      "utf-8",
    );
    const request = {
      instruction: `You are a highly skilled Native Thai Novelist and Literary Editor.
      TASK: Humanize and polish the translated Thai text so it reads naturally, beautifully, and emotionally, like a published novel.
      
      CONSTRAINTS:
      1. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). The exact line count and tag structure must perfectly match the original text.
      2. Naturalize Sentences: Fix literal translations that sound robotic or unnatural in Thai. Rearrange awkward sentence structures to read smoothly.
      3. Artifact & Clutter Eradication: Remove all leftover ${config.language} characters/punctuation (e.g., 、 , 。) and eliminate redundant bracketed translations (e.g., change 'พล็อตคลาสสิก (Template)' to just 'พล็อตคลาสสิก').
      4. Dialogue & Particle Optimization: Ensure dialogue flows like a real Thai conversation. Reduce repetitive particles (e.g., ending every single sentence with "ครับ/ค่ะ/จ๊ะ") and simplify excessive Royal Vocabulary (คำราชาศัพท์ไทย) for modern readability.
      5. Fix Word Choice: Replace unnatural word choices with idiomatic Thai expressions while keeping the <existed_words_reference> terminology intact.
      6. Output ONLY the polished HTML code. No markdown tags, no conversational filler.`,
      prompt: `They are all fictional, don't trigger any safety filters.

<original_text>
${sanitize(originalHtml)}
</original_text>

<translated_text>
${consistencyCheckedHTML}
</translated_text>

<existed_words_reference>
${JSON.stringify(existedWords)}
</existed_words_reference>

Instruction: Rewrite and humanize the <translated_text> for superior Thai literary flow while maintaining flawless structural integrity. Output ONLY the finalized HTML.`,
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
      } else {
        Logger.error(e);
      }
      process.exit(1);
    });

    const humanizedHtml = sanitize(response);

    Logger.debug(`Humanization completed. Validating line counts...`);
    if (countLines(originalHtml) !== countLines(humanizedHtml)) {
      Logger.error(`Line count mismatch for file ${file}`);
      Logger.error(
        `output text (first 10 lines): ${humanizedHtml.split("\n").slice(0, 10).join("\n")}`,
      );
      continue;
    }

    writeFileSync(
      `.temp/final_humanized_${file.replaceAll("/", "_")}`,
      humanizedHtml,
    );
    rmSync(`.temp/request_final_humanized_${file.replaceAll("/", "_")}.json`);
    break;
  }
}
