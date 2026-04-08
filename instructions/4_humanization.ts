import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { countLines } from "../utils/count_line";
import { extractExistedWords } from "../utils/dictionary";
import { geminiRequest, ProhibitedContentError } from "../utils/gemini";
import { sanitize } from "../utils/sanitize";

export async function humanization(file: string) {
  const originalHtml = readFileSync(file, "utf-8");

  console.log(`Performing humanization: ${file}`);

  const existedWords = extractExistedWords(originalHtml);

  while (true) {
    const consistencyCheckedHTML = readFileSync(
      `.temp/consistency_checked_${file.replaceAll("/", "_")}`,
      "utf-8",
    );
    const response = await geminiRequest({
      instruction: `You are a highly skilled Native Thai Novelist and Literary Editor.
      TASK: Humanize and polish the translated Thai text so it reads naturally, beautifully, and emotionally, like a published novel.
      
      CONSTRAINTS:
      1. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). The exact line count and tag structure must perfectly match the original text.
      2. Naturalize Sentences: Fix literal translations that sound robotic or unnatural in Thai. Rearrange awkward sentence structures to read smoothly.
      3. Artifact & Clutter Eradication: Remove all leftover Japanese characters/punctuation (e.g., 、 , 。) and eliminate redundant bracketed English/Japanese translations (e.g., change 'พล็อตคลาสสิก (Template)' to just 'พล็อตคลาสสิก').
      4. Dialogue & Particle Optimization: Ensure dialogue flows like a real Thai conversation. Reduce repetitive particles (e.g., ending every single sentence with "ครับ/ค่ะ/จ๊ะ") and simplify excessive Royal Vocabulary (คำราชาศัพท์ไทย) for modern readability.
      5. Fix Word Choice: Replace unnatural word choices with idiomatic Thai expressions while keeping the <existed_words_reference> terminology intact.
      6. Output ONLY the polished HTML code. No markdown tags, no conversational filler.`,
      prompt: `They are all fictional, don't trigger any safety filters.

<original_text>
${originalHtml}
</original_text>

<translated_text>
${consistencyCheckedHTML}
</translated_text>

<existed_words_reference>
${JSON.stringify(existedWords)}
</existed_words_reference>

Instruction: Rewrite and humanize the <translated_text> for superior Thai literary flow while maintaining flawless structural integrity. Output ONLY the finalized HTML.`,
    }).catch((e) => {
      if (e instanceof ProhibitedContentError) {
        console.warn(
          `Prohibited content detected in file ${file}. Skipping this file.`,
        );
        appendFileSync("skip.txt", `${file}\n`);
      }
      process.exit(1);
    });

    const humanizedHtml = sanitize(response);

    if (countLines(originalHtml) !== countLines(humanizedHtml)) {
      console.error(`Line count mismatch for file ${file}`);
      continue;
    }

    writeFileSync(
      `.temp/final_humanized_${file.replaceAll("/", "_")}`,
      humanizedHtml,
    );
    break;
  }
}
