import { execSync } from "child_process";
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
import { isJapanese } from "../utils/lang";
import type { Dictonary } from "../utils/types";

export async function extraction(file: string) {
  if (!existsSync(".temp")) mkdirSync(".temp");
  Logger.info(`Extracting: ${file}`);

  const rawHtml = readFileSync(file, "utf-8");
  const existedWords = extractExistedWords(rawHtml);
  const previousContent = getPreviousChapterContent(file);

  let chunk = 0;
  let chunkOffset = 0;
  let allExtractedItems: any[] = [];
  while (true) {
    const rawLines = sanitize(rawHtml).split("\n");
    const chunkStart = chunk * appConfig.chunkSize + chunkOffset;
    const chunkEnd = Math.min(
      (chunk + 1) * appConfig.chunkSize,
      rawLines.length,
    );
    const processedChunk = rawLines.slice(chunkStart, chunkEnd).join("\n");
    if (processedChunk.length === 0) {
      Logger.info(`No more content to extract. Ending process for ${file}.`);
      break;
    }
    Logger.debug(`  Chunk ${chunk + 1} (lines ${chunkStart + 1}-${chunkEnd})`);
    const previousChunk =
      chunk > 0
        ? rawLines
            .slice(
              Math.max(0, chunkStart - appConfig.previousChunk),
              chunkStart,
            )
            .join("\n")
        : previousContent;

    if (!existsSync(`.temp/extraction_${file.replaceAll("/", "_")}.json`)) {
      const request = {
        instruction: `You are an expert ${novelConfig.originalLanguage}-to-Thai literary translator. 
TASK: Extract only High-Impact unique terms (Character Names, Locations, Unique Spells/Artifacts). 

CONSTRAINTS: 
1. Ignore common nouns, general verbs, or adjectives (e.g., 'sword', 'running', 'beautiful') unless they are part of a specific Title.
2. The 'name' field MUST be the original ${novelConfig.originalLanguage}. Other fields MUST be in Thai. Split between first name and last name if it's a character.
3. Fields for characters: gender, speaking_style, and prohibited_phrases (Thai).
4. If a term is already in the 'Existed Words' list, ONLY include it if you are providing a NEW correction or additional detail, ie. from unknown gender to specified gender. Don't change translation to keep consistency between chapters.
5. Do not add parentheses in translations unless original or name contains parentheses.

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
    
    ${
      allExtractedItems.length > 0
        ? `<previously_extracted>
    ${JSON.stringify(allExtractedItems)}
    </previously_extracted>
    
    `
        : ""
    }Instruction: Extract ONLY new or updated high-impact terms from the original_text above. Use the previous_chapter for context on recurring characters and terms. Do not extract common dictionary words or chapter titles. Avoid duplicating terms already in previously_extracted. Output in JSON.`,
        body: {
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: `The ${novelConfig.originalLanguage} term or character name (Used as the key)`,
                      },
                      type: {
                        type: "string",
                        enum: ["character", "terminology"],
                        description:
                          "Classify if this is a character or terminology",
                      },
                      gender: { type: "string" },
                      base_style: { type: "string" },
                      negative_constraints: { type: "string" },
                      example: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            input: { type: "string" },
                            output: { type: "string" },
                          },
                        },
                      },
                      translations: {
                        type: "array",
                        items: { type: "string" },
                      },
                      description: { type: "string" },
                    },
                    required: ["name", "type", "description", "translations"],
                  },
                },
              },
              required: ["items"],
            },
          },
        },
      };
      writeFileSync(
        `.temp/request_extraction_${file.replaceAll("/", "_")}.json`,
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

      try {
        JSON.parse(response);
      } catch (e) {
        Logger.debug(`  └─ invalid JSON response, retrying...`);
        Logger.error(
          `Invalid JSON returned for file ${file}: ${(e as Error).message}`,
        );
        Logger.error(`Response text: ${JSON.stringify(response)}`);
        continue;
      }

      writeFileSync(
        `.temp/extraction_${file.replaceAll("/", "_")}.json`,
        response,
      );
    }

    const response = readFileSync(
      `.temp/extraction_${file.replaceAll("/", "_")}.json`,
      "utf-8",
    );

    const parsedData = JSON.parse(response);
    const chunkItems = parsedData.items || [];
    allExtractedItems.push(...chunkItems);

    Logger.debug(`  └─ chunk done (${chunkItems.length} terms extracted)`);

    if (existsSync(`.temp/extraction_${file.replaceAll("/", "_")}.json`))
      rmSync(`.temp/extraction_${file.replaceAll("/", "_")}.json`);
    if (
      existsSync(`.temp/request_extraction_${file.replaceAll("/", "_")}.json`)
    )
      rmSync(`.temp/request_extraction_${file.replaceAll("/", "_")}.json`);

    chunk++;
    chunkOffset = 0;

    if (chunkStart + appConfig.chunkSize >= rawLines.length) {
      Logger.debug(
        `All chunks processed. Processing ${allExtractedItems.length} total terms...`,
      );
      break;
    }
  }

  let currentData: Dictonary = {};
  try {
    currentData = JSON.parse(readFileSync("novel_data.json", "utf-8"));
  } catch {}

  let hasEmptyTranslations = false;

  for (const item of allExtractedItems) {
    let { name, type, ...rest } = item;
    name = name.toLowerCase();
    if (/[０-９]/.test(name) && JSON.stringify(rest).includes("ตอน")) continue;
    if (currentData[name]) {
      Logger.debug(`Skip existing term: ${name}`);
      continue;
    }

    if (Array.isArray(rest.translations)) {
      rest.translations = rest.translations.filter(
        (t: string) => !isJapanese(t),
      );
    }

    if (!rest.translations || rest.translations.length === 0) {
      Logger.warn(
        `All translations for '${name}' contained Japanese characters.`,
      );
      hasEmptyTranslations = true;
      continue;
    }

    Logger.debug(`Add new term: ${name}`);
    currentData[name] = { ...rest };
  }

  if (hasEmptyTranslations) {
    Logger.debug(`  └─ some terms had empty translations after filtering.`);
  }

  writeFileSync("novel_data.json", JSON.stringify(currentData, null, 2));

  execSync(`git add novel_data.json`);

  writeFileSync(
    `.temp/extraction_${file.replaceAll("/", "_")}`,
    JSON.stringify({ items: allExtractedItems }, null, 2),
  );
}
