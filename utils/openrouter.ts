import { existsSync, rmSync, statSync, writeFileSync } from "fs";
import { appConfig } from "../config";
import { HighDemandError, ProhibitedContentError } from "./errors";
import { Logger } from "./logger";
import { opencodeRequest } from "./opencode";
import type { AIRequest } from "./types";
import { ensureTempDir } from "./temp";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function getApiKey() {
  if (appConfig.openrouterAPIKeys.length === 0) {
    Logger.error("No OpenRouter API keys provided in config.");
    process.exit(1);
  }
  const nonExpiredKeys = appConfig.openrouterAPIKeys.filter(
    (key) => !existsSync(`.temp/${key}`),
  );
  if (nonExpiredKeys.length === 0) {
    appConfig.openrouterAPIKeys.forEach((key) => {
      if (
        Date.now() - statSync(`.temp/${key}`).ctime.getTime() >
        1000 * 60 * 60
      ) {
        rmSync(`.temp/${key}`);
        Logger.info(
          `OpenRouter API key ${key.slice(0, 8)}... has been reset and is now available for use.`,
        );
      }
    });
    Logger.error(
      "All OpenRouter API keys have been used up. Please add more keys to config.",
    );
    return;
  }
  return nonExpiredKeys[Math.floor(Math.random() * nonExpiredKeys.length)];
}

export async function openrouterRequest({
  instruction,
  prompt,
  body: additionalBody,
}: AIRequest) {
  ensureTempDir();
  const body: Record<string, unknown> = {
    model: appConfig.model.openrouter,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: prompt },
    ],
    temperature: 1.0,
  };

  // Apply additional body params (e.g. response_format, max_tokens)
  if (additionalBody) {
    Object.assign(body, additionalBody);
  }

  let retryCount = 0;
  while (true) {
    Logger.debug(`Sending request to OpenRouter API`);
    const start = Date.now();
    const apiKey = getApiKey();
    if (!apiKey) {
      Logger.info(
        "No available OpenRouter API keys. Falling back to OpenCode...",
      );
      return opencodeRequest({
        instruction,
        prompt,
        body: additionalBody,
      });
    }
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1000 * 60 * 60),
      // @ts-ignore - Bun-specific extension
      timeout: false,
      keepalive: true,
      verbose: appConfig.debug,
    }).catch((e) => {
      Logger.error(
        `Request to OpenRouter API failed after ${Math.round((Date.now() - start) / 1000)} seconds`,
      );
      Logger.error(e);
      process.exit(1);
    });

    Logger.debug(
      `Response received from OpenRouter API with status ${response.status} after ${Math.round((Date.now() - start) / 1000)} seconds`,
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error?.message || (await response.text());
      Logger.error(
        `OpenRouter API Error: ${response.status} - ${errorMessage}`,
      );

      // Handle Retry-After header
      if (response.status === 429 || response.status === 503) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const waitSeconds =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter
            : 2 ** retryCount;
        Logger.warn(`Retrying after ${waitSeconds} seconds...`);
        retryCount++;
        if (retryCount > 5) {
          if (appConfig.skipHighDemand) throw new HighDemandError();
          return opencodeRequest({
            instruction,
            prompt,
            body: additionalBody,
          });
        }
        await new Promise((res) => setTimeout(res, waitSeconds * 1000));
        continue;
      }

      // Handle rate limit (429) with key rotation
      if (response.status === 429) {
        Logger.error(
          "OpenRouter API key rate limit reached. Marking current key as used and retrying with next key...",
        );
        writeFileSync(`.temp/${apiKey}`, "used");
        await new Promise((res) => setTimeout(res, 5000));
        continue;
      }

      // Handle payment required (402)
      if (response.status === 402) {
        Logger.error(
          "OpenRouter API key has insufficient credits. Marking current key as used and retrying with next key...",
        );
        writeFileSync(`.temp/${apiKey}`, "used");
        await new Promise((res) => setTimeout(res, 5000));
        continue;
      }

      process.exit(1);
    }

    const data = await response.json().catch((e) => {
      Logger.error(e);
      process.exit(1);
    });

    // Check for content policy violations
    const dataStr = JSON.stringify(data);
    if (
      dataStr.includes("PROHIBITED_CONTENT") ||
      dataStr.includes("content_policy_violation")
    ) {
      if (appConfig.skipProhibitedContent) {
        throw new ProhibitedContentError();
      }
      return opencodeRequest({ instruction, prompt, body: additionalBody });
    }

    // Extract response text from OpenAI-compatible format
    if (!data.choices || data.choices.length === 0) {
      Logger.error(`No choices returned from OpenRouter`);
      Logger.error(`Response: ${dataStr}`);
      continue;
    }

    const choice = data.choices[0];
    if (!choice.message || !choice.message.content) {
      Logger.error(`No content returned in choice`);
      Logger.error(`Response: ${dataStr}`);
      continue;
    }

    let responseText = choice.message.content as string;

    // Some models wrap output in markdown code fences — strip them
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
