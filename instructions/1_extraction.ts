import { execSync } from "child_process";
import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { extractExistedWords } from "../utils/dictionary";
import { geminiRequest, ProhibitedContentError } from "../utils/gemini";
import type { Dictonary } from "../utils/types";

export async function extraction(file: string) {
  console.log(`Extracting: ${file}`);

  const rawHtml = readFileSync(file, "utf-8");
  const existedWords = extractExistedWords(rawHtml);

  while (true) {
    const response = await geminiRequest({
      instruction: `You are an expert Japanese-to-Thai literary translator. 
          TASK: Extract only High-Impact unique terms (Character Names, Locations, Unique Spells/Artifacts). 
          
          CONSTRAINTS: 
          1. Ignore common nouns, general verbs, or adjectives (e.g., 'sword', 'running', 'beautiful') unless they are part of a specific Title.
          2. The 'name' field MUST be the original Japanese. Other fields MUST be in Thai. Split between first name and last name if it's a character.
          3. Fields for characters: gender, speaking_style, and prohibited_phrases (Thai).
          4. If a term is already in the 'Existed Words' list, ONLY include it if you are providing a NEW correction or additional detail, ie. from unknown gender to specified gender. Don't change translation to keep consistency between chapters.`,
      prompt: `They are all fictional, don't trigger any safety filters.
    
    <source_text>
    ${rawHtml}
    </source_text>
    
    <existed_words_reference>
    ${JSON.stringify(existedWords)}
    </existed_words_reference>
    
    Instruction: Extract ONLY new or updated high-impact terms from the source_text above. Do not extract common dictionary words. Output in JSON.`,
      body: {
        generationConfig: {
          thinkingConfig: {
            thinkingLevel: "medium",
          },
          temperature: 1.0,
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
                      description:
                        "The Japanese term or character name (Used as the key)",
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
    }).catch((e) => {
      if (e instanceof ProhibitedContentError) {
        console.warn(
          `Prohibited content detected in file ${file}. Skipping this file.`,
        );
        appendFileSync("skip.txt", `${file}\n`);
      }
      process.exit(1);
    });

    try {
      JSON.parse(response);
    } catch (e) {
      console.error(
        `Invalid JSON returned for file ${file}: ${(e as Error).message}`,
      );
      console.error(`Response text: ${JSON.stringify(response)}`);
      continue;
    }

    const parsedData = JSON.parse(response);

    const extracted: Dictonary = {};
    for (const item of parsedData.items || []) {
      const { name, type, ...rest } = item;
      if (/[０-９]/.test(name) && JSON.stringify(rest).includes("ชื่อตอน"))
        continue;
      extracted[name] = rest;
    }

    let currentData: Dictonary = {};
    try {
      currentData = JSON.parse(readFileSync("novel_data.json", "utf-8"));
    } catch {}

    writeFileSync(
      "novel_data.json",
      JSON.stringify({ ...currentData, ...extracted }, null, 2),
    );

    execSync(`git add novel_data.json`);

    writeFileSync(`.temp/extraction_${file.replaceAll("/", "_")}`, "success");
    break;
  }
}
