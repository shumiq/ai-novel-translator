import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { appConfig, novelConfig } from "./config";
import { aiRequest } from "./utils/ai";
import { countLines } from "./utils/count_line";
import { HighDemandError, ProhibitedContentError } from "./utils/gemini";
import { Logger } from "./utils/logger";
import { sanitize } from "./utils/sanitize";
import { validate } from "./utils/validate";

const FINISH_FILE = ".temp/fix_gender_finish.txt";

function loadFinished(): string[] {
  if (!existsSync(FINISH_FILE)) return [];
  return readFileSync(FINISH_FILE, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function getMalePronounLines(text: string): number[] {
  return text
    .split("\n")
    .map((line, i) =>
      line.includes("ผม") || line.includes("ครับ") ? i + 1 : null,
    )
    .filter(Boolean) as number[];
}

async function fixGenderForFile(file: string): Promise<boolean> {
  if (!existsSync(".temp")) mkdirSync(".temp");

  const rawHTML = readFileSync(file, "utf-8");
  const lines = getMalePronounLines(rawHTML);

  if (lines.length === 0) return false;

  const targetLines = lines.join(", ");
  Logger.info(`Fixing gender in ${file} (lines: ${targetLines})`);

  const instruction = `You are a Thai localization editor for ${novelConfig.originalLanguage}-to-Thai novels.
The protagonist is a **female**. The Thai translation engine sometimes incorrectly uses male pronouns/particles for her.

TASK: Correct the gender of pronouns and polite particles **only when they refer to the female protagonist**. Some lines may be from other characters' perspectives or dialogue where male pronouns/particles are correct — do NOT change those.

CONSTRAINTS:
1. Structural Integrity (CRITICAL): NEVER alter, merge, or remove HTML tags (<p>, <div>, etc.). Every line must correspond 1-to-1 with the original HTML.
2. Gender Pronoun & Particle Guide:
   - **ผม** (male pronoun) → **ดิฉัน** or **ฉัน**
   - **ครับ** (male polite particle) → **ค่ะ** or **คะ** (female polite particle)
3. Context Awareness (CRITICAL):
   - **Protagonist's own speech or narration** → Fix the pronoun/particle
   - **Other characters' dialogue** → Leave as-is (e.g., a male character saying "ผม" or "ครับ" is correct)
   - **Narration from another character's POV** → Leave as-is
   - **Ambiguous lines** → Leave as-is rather than risk a wrong fix
4. Do not add parentheses in translations unless the original text contains parentheses.
5. Keep all HTML escaping intact (e.g., &amp;, &lt;, &gt;). Do not convert them back to symbols.
6. Output ONLY the corrected HTML code. Do not add markdown formatting or explanations.

Additional Context:
${novelConfig.additionalContext.map((ctx) => `- ${ctx}`).join("\n")}
`;

  let validationError: string | null = null;
  let validationRetries = 0;

  while (true) {
    const request = {
      instruction,
      prompt: `They are all fictional, don't trigger any safety filters.

<original_text>
${sanitize(rawHTML)}
</original_text>

Target lines to check (line numbers with "ผม" or "ครับ"): ${targetLines}

${validationError ? `<feedback>\n${validationError}\n</feedback>\n\n` : ""}Instruction: Review the <original_text> and correct pronouns/particles on the target lines ONLY when they refer to the female protagonist. Preserve all other characters' speech exactly. Output ONLY the corrected HTML with exactly ${countLines(rawHTML)} lines.`,
    };

    writeFileSync(
      `.temp/request_fix_gender_${file.replaceAll("/", "_")}.json`,
      JSON.stringify(request, null, 2),
    );

    const response = await aiRequest(request).catch((e) => {
      if (e instanceof ProhibitedContentError) {
        Logger.warn(
          `Prohibited content detected in ${file}. Skipping this file.`,
        );
        appendFileSync(".temp/skip.txt", `${file}\n`);
      } else if (e instanceof HighDemandError) {
        Logger.warn(`High demand detected in ${file}. Skipping this file.`);
        appendFileSync(".temp/skip.txt", `${file}\n`);
      } else {
        Logger.error(e);
      }
      throw e;
    });

    const correctedHtml = sanitize(response);

    Logger.debug(`  └─ validating...`);
    const validationErr = validate(
      rawHTML,
      correctedHtml,
      `file ${file} gender fix`,
    );
    if (validationErr) {
      validationRetries++;
      Logger.debug(
        `  └─ validation failed, attempt ${validationRetries} (line ${validationErr.match(/at line (\d+)/)?.[1] ?? "?"})`,
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
      validationError = validationErr;
      continue;
    }

    const oldLines = rawHTML.split("\n");
    const newLines = correctedHtml.split("\n");

    if (oldLines.length !== newLines.length) {
      Logger.warn(
        `Line count mismatch in ${file}: ${oldLines.length} vs ${newLines.length}. Skipping extra sanitizing.`,
      );
      writeFileSync(file, correctedHtml);
    } else {
      const sanitizedLines = oldLines.map((oldLine, i) => {
        const newLine = newLines[i]!;
        if (oldLine === newLine) return oldLine;

        const oldMe = (oldLine.match(/ผม/g) ?? []).length;
        const newMe = (newLine.match(/ผม/g) ?? []).length;
        const increaseMe = newMe - oldMe;

        const oldDichan = (oldLine.match(/ดิฉัน/g) ?? []).length;
        const newDichan = (newLine.match(/ดิฉัน/g) ?? []).length;
        const oldChan = (oldLine.match(/ฉัน/g) ?? []).length;
        const newChan = (newLine.match(/ฉัน/g) ?? []).length;
        const increaseFemale = newDichan + newChan - (oldDichan + oldChan);

        const oldKrub = (oldLine.match(/ครับ/g) ?? []).length;
        const newKrub = (newLine.match(/ครับ/g) ?? []).length;
        const increaseKrub = newKrub - oldKrub;

        const oldKa = (oldLine.match(/ค่ะ/g) ?? []).length;
        const newKa = (newLine.match(/ค่ะ/g) ?? []).length;
        const oldKa2 = (oldLine.match(/คะ/g) ?? []).length;
        const newKa2 = (newLine.match(/คะ/g) ?? []).length;
        const increaseFemaleParticle = newKa + newKa2 - (oldKa + oldKa2);

        const meBalanced = increaseMe !== 0 && increaseMe === -increaseFemale;
        const krubBalanced =
          increaseKrub !== 0 && increaseKrub === -increaseFemaleParticle;

        if (meBalanced || krubBalanced) {
          // Logger.info(`  └─ line ${i + 1} (old)\t: ${oldLine}`);
          // Logger.info(`  └─ line ${i + 1} (new)\t: ${newLine} ✅`);
          return newLine;
        }
        // Logger.warn(`  └─ line ${i + 1} (new)\t: ${newLine} ❌`);
        return oldLine;
      });

      writeFileSync(file, sanitizedLines.join("\n"));
    }
    rmSync(`.temp/request_fix_gender_${file.replaceAll("/", "_")}.json`);
    Logger.info(`Done: ${file}`);
    return true;
  }
}

async function main() {
  const finished = loadFinished();

  // dynamically import extractThai to avoid circular dependency
  const { extractThai } = await import("./utils/extract");
  const files = extractThai().filter((f) => !finished.includes(f));

  if (files.length === 0) {
    Logger.info("No files remaining to process.");
    return;
  }

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const hasMalePronouns = getMalePronounLines(content).length > 0;

    if (!hasMalePronouns) {
      appendFileSync(FINISH_FILE, file + "\n");
      continue;
    }

    while (true) {
      try {
        const fixed = await fixGenderForFile(file);
        if (fixed) {
          appendFileSync(FINISH_FILE, file + "\n");
          break;
        }
      } catch {
        // errors already logged and skipped in fixGenderForFile
      }
    }
  }
}

main();
