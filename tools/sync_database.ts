// Name: Sync Database
// Description: Sync translation database — extract and translate new Japanese terms using AI
import { execSync } from "child_process";
import {
  appendFileSync,
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { novelConfig } from "../config";
import { aiRequest } from "../utils/ai";
import { extractExistedWords } from "../utils/dictionary";
import { HighDemandError, ProhibitedContentError } from "../utils/gemini";
import { isJapanese } from "../utils/lang";
import { Logger } from "../utils/logger";
import { sanitize } from "../utils/sanitize";
import type { Dictonary } from "../utils/types";
import { ensureTempDir } from "../utils/temp";

async function syncDatabase() {
  ensureTempDir();

  let currentData: Dictonary = {};
  try {
    currentData = JSON.parse(readFileSync("novel_data.json", "utf-8"));
  } catch {
    Logger.info("novel_data.json not found or empty. Starting fresh.");
  }
  Logger.info(
    `Loaded dictionary with ${Object.keys(currentData).length} existing entries.`,
  );

  if (!existsSync(".temp/novel_files.json")) {
    Logger.error(".temp/novel_files.json not found. Run prepare.ts first.");
    process.exit(1);
  }
  const allFiles: string[] = JSON.parse(
    readFileSync(".temp/novel_files.json", "utf-8"),
  );

  const stagedOutput = execSync(
    "git -c core.quotepath=false diff --cached --name-only -- books/",
    {
      encoding: "utf-8",
    },
  ).trim();
  const stagedFiles = stagedOutput
    ? stagedOutput
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  if (stagedFiles.length === 0) {
    Logger.error("No staged files found under books/. Nothing to sync.");
    process.exit(1);
  }

  const filesToProcess = allFiles.filter((f) => stagedFiles.includes(f));

  if (filesToProcess.length === 0) {
    Logger.error("No staged files match novel_files.json entries.");
    process.exit(1);
  }

  Logger.info(
    `Found ${stagedFiles.length} staged files, ${filesToProcess.length} match novel_files.json.`,
  );

  for (const [index, file] of filesToProcess.entries()) {
    const checkpoint = `.temp/sync_db_${file.replaceAll("/", "_")}`;
    const responseCache = `.temp/sync_db_${file.replaceAll("/", "_")}.json`;
    const requestCache = `.temp/request_sync_db_${file.replaceAll("/", "_")}.json`;

    if (existsSync(checkpoint)) {
      Logger.progress(
        `Skipping already processed (${index + 1}/${filesToProcess.length}): ${file}`,
      );
      continue;
    }

    Logger.info(`Processing (${index + 1}/${filesToProcess.length}): ${file}`);

    let originalContent: string;
    let translatedContent: string;
    try {
      originalContent = execSync(
        `git -c core.quotepath=false show "HEAD:${file}"`,
        {
          encoding: "utf-8",
        },
      ).trim();
      translatedContent = execSync(
        `git -c core.quotepath=false show ":${file}"`,
        {
          encoding: "utf-8",
        },
      ).trim();
    } catch {
      Logger.warn(`Skipping ${file}: unable to read git content.`);
      appendFileSync(".temp/skip.txt", `${file}\n`);
      continue;
    }

    if (!originalContent || !translatedContent) {
      Logger.warn(`Skipping ${file}: empty content.`);
      appendFileSync(".temp/skip.txt", `${file}\n`);
      continue;
    }

    const existedWords = extractExistedWords(originalContent);

    while (true) {
      const request = {
        instruction: `You are an expert ${novelConfig.originalLanguage}-to-Thai literary translator. 
TASK: Extract only High-Impact unique terms (Character Names, Locations, Unique Spells/Artifacts) by comparing original text with its Thai translation.

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
    
<original_text>
${sanitize(originalContent)}
</original_text>

<thai_translation>
${sanitize(translatedContent)}
</thai_translation>

<existed_words_reference>
${JSON.stringify(existedWords)}
</existed_words_reference>

Instruction: Extract ONLY new or updated high-impact terms by comparing the original_text with the thai_translation above. Focus on character names, locations, and unique terminology that appear in both versions. Output in JSON.`,
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

      writeFileSync(requestCache, JSON.stringify(request, null, 2));

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
        Logger.error(
          `Invalid JSON returned for file ${file}: ${(e as Error).message}`,
        );
        Logger.error(`Response text: ${JSON.stringify(response)}`);
        continue;
      }

      writeFileSync(responseCache, response);

      const parsedData = JSON.parse(response);
      let hasEmptyTranslations = false;
      let addedCount = 0;

      for (const item of parsedData.items || []) {
        let { name, type, ...rest } = item;
        name = name.toLowerCase();
        if (/[０-９]/.test(name) && JSON.stringify(rest).includes("ตอน"))
          continue;
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
            `All translations for '${name}' contained Japanese characters. Re-running extraction for ${file}.`,
          );
          hasEmptyTranslations = true;
          continue;
        }

        Logger.debug(`Add new term: ${name}`);
        currentData[name] = { ...rest };
        addedCount++;
      }

      if (hasEmptyTranslations) {
        if (existsSync(responseCache)) rmSync(responseCache);
        continue;
      }

      writeFileSync("novel_data.json", JSON.stringify(currentData, null, 2));
      execSync("git add novel_data.json");
      writeFileSync(checkpoint, "done");

      if (existsSync(requestCache)) rmSync(requestCache);
      if (existsSync(responseCache)) rmSync(responseCache);

      Logger.info(
        `Completed (${index + 1}/${filesToProcess.length}): ${file}. Added ${addedCount} terms. Dictionary now has ${Object.keys(currentData).length} entries.`,
      );
      break;
    }
  }

  Logger.info(
    `Sync complete. Dictionary has ${Object.keys(currentData).length} entries.`,
  );
}

syncDatabase();

if (novelConfig.dictionaryPath) {
  cpSync("./novel_data.json", novelConfig.dictionaryPath);
  Logger.info(`Copied: ./novel_data.json to ${novelConfig.dictionaryPath}`);
}
