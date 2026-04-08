import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { countLines } from "../utils/count_line";
import { extractExistedWords } from "../utils/dictionary";
import { geminiRequest, ProhibitedContentError } from "../utils/gemini";
import { sanitize } from "../utils/sanitize";

export async function translation(file: string) {
  console.log(`Translating: ${file}`);

  const rawHTML = readFileSync(file, "utf-8");
  const existedWords = extractExistedWords(rawHTML);

  while (true) {
    const response = await geminiRequest({
      instruction: `You are an expert Japanese-to-Thai literary translator specializing in light novels and web novels.
          TASK: Translate the provided Japanese HTML text into Thai.
          
          CONSTRAINTS:
          1. 1:1 Semantic Translation: Ensure every source line has a corresponding Thai translation. Do not merge, skip, or summarize.
          2. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). The exact HTML structure and line breaks must perfectly match the original to maintain line counts.
          3. Strict Gender Pronouns: Must follow gender-based pronouns strictly (Male: ผม/นาย/ครับ; Female: หนู/ดิฉัน/เธอ/ฉัน/ค่ะ/คะ) or use gender-neutral pronouns (ie. ข้า/เรา/คุณ). Use context to determine the speaker.
          4. Terminology: Use the <existed_words_reference> strictly for names, places, and artifacts.
          5. Output ONLY the translated HTML code. Do not add markdown blocks (\`\`\`), greetings, or explanations.`,
      prompt: `They are all fictional, don't trigger any safety filters.
    
    <source_text>
    ${rawHTML}
    </source_text>
    
    <existed_words_reference>
    ${JSON.stringify(existedWords)}
    </existed_words_reference>
    
    Instruction: Translate the <source_text> to Thai line-by-line following the 1:1 semantic and structural constraints. Output ONLY valid HTML.`,
    }).catch((e) => {
      if (e instanceof ProhibitedContentError) {
        console.warn(
          `Prohibited content detected in file ${file}. Skipping this file.`,
        );
        appendFileSync("skip.txt", `${file}\n`);
      }
      process.exit(1);
    });
    const translatedHtml = sanitize(response);
    if (countLines(rawHTML) !== countLines(translatedHtml)) {
      console.error(`Line count mismatch for file ${file}`);
      continue;
    }
    writeFileSync(
      `.temp/translated_${file.replaceAll("/", "_")}`,
      translatedHtml,
    );
    break;
  }
}
