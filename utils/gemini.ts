import {
  ApiError,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type ThinkingLevel,
} from "@google/genai";
import { existsSync, rmSync, statSync, writeFileSync } from "fs";
import { appConfig } from "../config";
import { HighDemandError, ProhibitedContentError } from "./errors";
import { Logger } from "./logger";
import { opencodeRequest } from "./opencode";
import { ensureTempDir } from "./temp";
import type { AIRequest } from "./types";

function getApiKey() {
  if (appConfig.geminiAPIKeys.length === 0) {
    Logger.error("No Gemini API keys provided in config.");
    process.exit(1);
  }
  const nonExpiredKeys = appConfig.geminiAPIKeys.filter(
    (key) => !existsSync(`.temp/${key}`),
  );
  if (nonExpiredKeys.length === 0) {
    appConfig.geminiAPIKeys.forEach((key) => {
      if (
        Date.now() - statSync(`.temp/${key}`).ctime.getTime() >
        1000 * 60 * 60
      ) {
        rmSync(`.temp/${key}`);
        Logger.info(
          `API key ${key} has been reset and is now available for use.`,
        );
      }
    });
    Logger.error(
      "All API keys have been used up. Please add more keys to config.",
    );
    return;
  }
  return nonExpiredKeys[Math.floor(Math.random() * nonExpiredKeys.length)];
}

export async function geminiRequest({
  instruction,
  prompt,
  body: additionalBody,
}: AIRequest) {
  ensureTempDir();
  const config: GenerateContentConfig = {
    systemInstruction: instruction,
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
    temperature: 1.0,
    thinkingConfig: {
      thinkingLevel: appConfig.thinking as ThinkingLevel,
    },
    // Merge REST-style generationConfig overrides (e.g. responseMimeType, responseSchema)
    ...(additionalBody as { generationConfig?: object })?.generationConfig,
    // The SDK retries on 5xx/429 by default — disable that so the retry
    // logic below (key rotation + OpenCode fallback) stays in control.
    httpOptions: { retryOptions: { attempts: 1 } },
  };

  // Loop to retry on 503 errors, which indicate the model is still loading
  let retryCount = 0;
  while (true) {
    Logger.debug(`Sending request to Gemini API`);
    const start = Date.now();
    const apiKey = getApiKey();
    if (!apiKey) {
      Logger.info("No available API keys. Falling back to OpenCode...");
      return opencodeRequest({
        instruction,
        prompt,
        body: additionalBody,
      });
    }
    const ai = new GoogleGenAI({ apiKey });

    let response: GenerateContentResponse;
    try {
      response = await ai.models.generateContent({
        model: appConfig.model.gemini,
        contents: prompt,
        // Fresh 1-hour timeout per attempt
        config: { ...config, abortSignal: AbortSignal.timeout(1000 * 60 * 60) },
      });
    } catch (e) {
      if (!(e instanceof ApiError)) {
        // Network-level failure or unexpected client error
        Logger.error(
          `Request to Gemini API failed after ${Math.round((Date.now() - start) / 1000)} seconds`,
        );
        Logger.error(e);
        process.exit(1);
      }

      const status = e.status;
      Logger.debug(
        `Response received from Gemini API with status ${status} after ${Math.round((Date.now() - start) / 1000)} seconds`,
      );
      Logger.error(`API Error: ${status} - ${e.message}`);
      if (status === 503) {
        if (retryCount > 5) {
          if (appConfig.skipHighDemand) throw new HighDemandError();
          return opencodeRequest({
            instruction,
            prompt,
            body: additionalBody,
          });
        }
        retryCount++;
        Logger.warn(`Retrying after 5 seconds...`);
        await new Promise((res) => setTimeout(res, 5000));
        continue;
      }
      if (status === 429) {
        Logger.error(
          "API key rate limit reached. Marking current key as used and retrying with next key...",
        );
        writeFileSync(`.temp/${apiKey}`, "used");
        await new Promise((res) => setTimeout(res, 5000));
        continue;
      }
      process.exit(1);
    }

    Logger.debug(
      `Response received from Gemini API with status ${response.sdkHttpResponse?.responseInternal?.status} after ${Math.round((Date.now() - start) / 1000)} seconds`,
    );

    if (JSON.stringify(response).includes("PROHIBITED_CONTENT")) {
      if (appConfig.skipProhibitedContent) {
        throw new ProhibitedContentError();
      }
      return opencodeRequest({ instruction, prompt, body: additionalBody });
    }

    const candidate = response.candidates?.at(0);
    if (!candidate) {
      Logger.error(`No candidates returned`);
      Logger.error(`Response text: ${JSON.stringify(response)}`);
      continue;
    }
    const parts = candidate.content?.parts;
    if (!parts) {
      Logger.error(`No content returned`);
      Logger.error(`Response text: ${JSON.stringify(response)}`);
      continue;
    }
    const firstPart = parts.at(0);
    if (!firstPart?.text) {
      Logger.error(`No text returned`);
      Logger.error(`Response text: ${JSON.stringify(response)}`);
      continue;
    }

    let responseText = firstPart.text;
    // Regex breakdown:
    // [\{\[\<] : Find the first {, [, or <
    // .* : Match everything in between (greedily)
    // [\}\]\>] : Find the last }, ], or >
    const match = responseText.match(/([\{\[\<].*[\}\]\>])/s);
    if (match) {
      responseText = match[0];
    }
    responseText = responseText.replaceAll("`", "");

    return responseText;
  }
}
