import { existsSync, rmSync, statSync, writeFileSync } from "fs";
import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";
import type { ChatRequest } from "@openrouter/sdk/models";
import { appConfig } from "../config";
import { HighDemandError, ProhibitedContentError } from "./errors";
import { Logger } from "./logger";
import { opencodeRequest } from "./opencode";
import { ensureTempDir } from "./temp";
import type { AIRequest } from "./types";

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
  const chatRequest: ChatRequest = {
    model: appConfig.model.openrouter,
    messages: [
      { role: "system", content: instruction },
      { role: "user", content: prompt },
    ],
    temperature: 1.0,
  };

  // Apply additional body params (e.g. responseFormat, maxTokens)
  if (additionalBody) {
    Object.assign(chatRequest, additionalBody);
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
    const openrouter = new OpenRouter({ apiKey });

    let result: Awaited<ReturnType<typeof openrouter.chat.send>> | undefined;
    try {
      result = await openrouter.chat.send(
        { chatRequest },
        {
          timeoutMs: 1000 * 60 * 60,
          // The SDK retries on 5XX by default — disable that so the retry
          // logic below (key rotation + OpenCode fallback) stays in control.
          retries: { strategy: "none" },
        },
      );
    } catch (e) {
      if (!(e instanceof OpenRouterError)) {
        // Network-level failure or unexpected client error
        Logger.error(
          `Request to OpenRouter API failed after ${Math.round((Date.now() - start) / 1000)} seconds`,
        );
        Logger.error(e);
        process.exit(1);
      }

      const status = e.statusCode;
      Logger.debug(
        `Response received from OpenRouter API with status ${status} after ${Math.round((Date.now() - start) / 1000)} seconds`,
      );

      if (status >= 200 && status < 300) {
        // The SDK validates 2xx responses against strict schemas. If a
        // successful response fails validation, salvage what we can from the
        // raw body instead of crashing — providers occasionally omit fields.
        let fallback: { choices?: unknown } | undefined;
        try {
          fallback = JSON.parse(e.body || "{}");
        } catch {
          fallback = undefined;
        }
        if (
          fallback &&
          Array.isArray(fallback.choices) &&
          fallback.choices.length > 0
        ) {
          Logger.warn(
            "OpenRouter response failed schema validation; using raw response body as fallback.",
          );
          result = fallback as typeof result;
          // Fall through to response processing below
        } else {
          Logger.error(
            `OpenRouter returned an invalid 2xx response: ${e.body}`,
          );
          process.exit(1);
        }
      } else {
        const errorPayload = e as OpenRouterError & {
          error?: { message?: string };
        };
        const errorMessage = errorPayload.error?.message || e.body || e.message;
        Logger.error(`OpenRouter API Error: ${status} - ${errorMessage}`);

        // Handle server overload (503): honor Retry-After header
        if (status === 503) {
          const retryAfter = Number(e.rawResponse.headers.get("Retry-After"));
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
        if (status === 429) {
          Logger.error(
            "OpenRouter API key rate limit reached. Marking current key as used and retrying with next key...",
          );
          writeFileSync(`.temp/${apiKey}`, "used");
          await new Promise((res) => setTimeout(res, 5000));
          continue;
        }

        // Handle payment required (402)
        if (status === 402) {
          Logger.error(
            "OpenRouter API key has insufficient credits. Marking current key as used and retrying with next key...",
          );
          writeFileSync(`.temp/${apiKey}`, "used");
          await new Promise((res) => setTimeout(res, 5000));
          continue;
        }

        process.exit(1);
      }
    }

    if (!result) {
      // Unreachable — every catch branch either assigns `result`, retries, or exits
      continue;
    }

    Logger.debug(
      `Response received from OpenRouter API after ${Math.round((Date.now() - start) / 1000)} seconds`,
    );

    // Streaming responses are never requested — guard against them anyway
    if (!("choices" in result)) {
      Logger.error(`Unexpected streaming response returned from OpenRouter`);
      continue;
    }

    // Check for content policy violations
    const dataStr = JSON.stringify(result);
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
    const choice = result.choices.at(0);
    if (!choice) {
      Logger.error(`No choices returned from OpenRouter`);
      Logger.error(`Response: ${dataStr}`);
      continue;
    }

    if (!choice.message || !choice.message.content) {
      Logger.error(`No content returned in choice`);
      Logger.error(`Response: ${dataStr}`);
      continue;
    }

    let responseText: string;
    if (typeof choice.message.content === "string") {
      responseText = choice.message.content;
    } else {
      // Multi-part content — concatenate the text parts
      responseText = choice.message.content
        .map((part) =>
          "text" in part && typeof part.text === "string" ? part.text : "",
        )
        .join("");
    }

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
