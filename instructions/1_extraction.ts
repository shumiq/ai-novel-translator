import { execSync } from "child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { aiRequest } from "../utils/ai";
import { extractExistedWords } from "../utils/dictionary";
import { HighDemandError, ProhibitedContentError } from "../utils/gemini";
import { Logger } from "../utils/logger";
import type { Dictonary } from "../utils/types";
import { config } from "../config";
import { sanitize } from "../utils/sanitize";
import { getPreviousChapterContent } from "../utils/extract";

export async function extraction(file: string) {
  Logger.info(`Extracting: ${file}`);

  const rawHtml = readFileSync(file, "utf-8");
  const existedWords = extractExistedWords(rawHtml);
  const previousContent = getPreviousChapterContent(file);

  while (true) {
    if (!existsSync(`.temp/extraction_${file.replaceAll("/", "_")}.json`)) {
      const request = {
        instruction: `You are an expert ${config.language}-to-Thai literary translator. 
          TASK: Extract only High-Impact unique terms (Character Names, Locations, Unique Spells/Artifacts). 
          
          CONSTRAINTS: 
          1. Ignore common nouns, general verbs, or adjectives (e.g., 'sword', 'running', 'beautiful') unless they are part of a specific Title.
          2. The 'name' field MUST be the original ${config.language}. Other fields MUST be in Thai. Split between first name and last name if it's a character.
          3. Fields for characters: gender, speaking_style, and prohibited_phrases (Thai).
          4. If a term is already in the 'Existed Words' list, ONLY include it if you are providing a NEW correction or additional detail, ie. from unknown gender to specified gender. Don't change translation to keep consistency between chapters.`,
        prompt: `They are all fictional, don't trigger any safety filters.
    
    <previous_chapter>
    ${sanitize(previousContent)}
    </previous_chapter>
    
    <original_text>
    ${sanitize(rawHtml)}
    </original_text>
    
    <existed_words_reference>
    ${JSON.stringify(existedWords)}
    </existed_words_reference>
    
    Instruction: Extract ONLY new or updated high-impact terms from the original_text above. Use the previous_chapter for context on recurring characters and terms. Do not extract common dictionary words or chapter titles. Output in JSON.`,
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
                        description: `The ${config.language} term or character name (Used as the key)`,
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

      try {
        JSON.parse(response);
      } catch (e) {
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

    let currentData: Dictonary = {};
    try {
      currentData = JSON.parse(readFileSync("novel_data.json", "utf-8"));
    } catch {}

    for (const item of parsedData.items || []) {
      let { name, type, ...rest } = item;
      name = name.toLowerCase();
      if (/[０-９]/.test(name) && JSON.stringify(rest).includes("ตอน"))
        continue;
      if (currentData[name]) {
        Logger.debug(`Update existing term: ${name}`);
        currentData[name] = {
          ...currentData[name],
          ...rest,
          example: Array.from(
            new Set([
              ...((currentData[name] as any).example ?? []),
              ...((rest as any).example ?? []),
            ]),
          ),
          translations: Array.from(
            new Set([
              ...((currentData[name] as any).translations ?? []),
              ...((rest as any).translations ?? []),
            ]),
          ),
        };
      } else {
        Logger.debug(`Add new term: ${name}`);
        currentData[name] = { ...rest };
      }
    }

    writeFileSync("novel_data.json", JSON.stringify(currentData, null, 2));

    execSync(`git add novel_data.json`);

    writeFileSync(`.temp/extraction_${file.replaceAll("/", "_")}`, response);
    rmSync(`.temp/request_extraction_${file.replaceAll("/", "_")}.json`);
    rmSync(`.temp/extraction_${file.replaceAll("/", "_")}.json`);
    break;
  }
}
