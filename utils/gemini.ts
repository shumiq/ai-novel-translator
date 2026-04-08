import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { config } from "../config";
import { Logger } from "./logger";

const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;

let retryCount = 0.5;

function getApiKey() {
  if (config.apiKeys.length === 0) {
    Logger.error("No API keys provided in config.");
    process.exit(1);
  }
  const nonExpiredKeys = config.apiKeys.filter(
    (key) => !existsSync(`.temp/${key}`),
  );
  if (nonExpiredKeys.length === 0) {
    config.apiKeys.forEach((key) => {
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
    process.exit(1);
  }
  return nonExpiredKeys[Math.floor(Math.random() * nonExpiredKeys.length)];
}

export async function geminiRequest({
  instruction,
  prompt,
  body: additionalBody,
}: {
  instruction: string;
  prompt: string;
  body?: object;
}) {
  const body = {
    systemInstruction: {
      parts: [
        {
          text: instruction,
        },
      ],
    },
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE",
      },
    ],
    ...additionalBody,
    generationConfig: {
      thinkingConfig: {
        thinkingLevel: config.thinking,
      },
      temperature: 1.0,
      ...(additionalBody as any)?.generationConfig,
    },
  };

  // Loop to retry on 503 errors, which indicate the model is still loading
  while (true) {
    Logger.debug(`Sending request to Gemini API`);
    const start = Date.now();
    const response = await fetch(`${url}?key=${getApiKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1000 * 60 * 60),
      // @ts-ignore - Bun-specific extension
      timeout: false,
      keepalive: true,
      verbose: config.debug,
    }).catch((e) => {
      Logger.error(
        `Request to Gemini API failed after ${Math.round((Date.now() - start) / 1000)} seconds`,
      );
      Logger.error(e);
      process.exit(1);
    });

    Logger.debug(
      `Response received from Gemini API with status ${response.status} after ${Math.round((Date.now() - start) / 1000)} seconds`,
    );
    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`API Error: ${response.status} - ${errorText}`);
      if (response.status == 503) {
        retryCount = Math.min(retryCount * 2, 120); // Cap retry count to avoid excessively long waits
        Logger.error(`Retrying after ${retryCount * 5} seconds...`);
        await new Promise((res) => setTimeout(res, retryCount * 5000));
        continue;
      }
      if (response.status == 429) {
        Logger.error(
          "API key rate limit reached. Marking current key as used and retrying with next key...",
        );
        writeFileSync(`.temp/${getApiKey()}`, "used");
        await new Promise((res) => setTimeout(res, 5000));
        continue;
      }
      process.exit(1);
    }

    retryCount = 0.5; // Reset retry count on successful response

    const data = await response.json().catch((e) => {
      Logger.error(e);
      process.exit(1);
    });

    if (JSON.stringify(data).includes("PROHIBITED_CONTENT")) {
      if (config.skipProhibitedContent) {
        throw new ProhibitedContentError();
      }
      return geminiCliRequest({ instruction, prompt, body: additionalBody });
    }

    if (!data.candidates || data.candidates.length === 0) {
      Logger.error(`No candidates returned`);
      Logger.error(`Response text: ${JSON.stringify(data)}`);
      continue;
    }
    if (!data.candidates[0].content || !data.candidates[0].content.parts) {
      Logger.error(`No content returned`);
      Logger.error(`Response text: ${JSON.stringify(data)}`);
      continue;
    }
    if (!data.candidates[0].content.parts[0].text) {
      Logger.error(`No text returned`);
      Logger.error(`Response text: ${JSON.stringify(data)}`);
      continue;
    }

    let responseText = data.candidates[0].content.parts[0].text as string;
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

export async function geminiCliRequest({
  instruction,
  prompt,
  body: additionalBody,
}: Parameters<typeof geminiRequest>[0]) {
  Logger.info(`Falling back to Gemini CLI`);
  // Loop to retry on any errors from the Gemini CLI, which can be unstable at times
  while (true) {
    writeFileSync(
      ".temp/input.json",
      JSON.stringify({ instruction, prompt, ...additionalBody }),
    );
    try {
      const agentPrompt = `follow the instruction and prompt in .temp/input.json and output in .temp/output.txt`;
      execSync(
        `gemini --yolo --model ${config.model} --prompt "${agentPrompt}"`,
        {
          stdio: "inherit",
          timeout: 1000 * 60 * 10,
          killSignal: "SIGKILL",
        },
      );
    } catch {}
    if (!existsSync(".temp/output.txt")) {
      Logger.error(`Gemini CLI timed out. Retrying Gemini CLI request...`);
      continue;
    }
    const output = readFileSync(".temp/output.txt", "utf-8");
    if (!output) {
      Logger.error(
        `Gemini CLI returned empty output. Retrying Gemini CLI request...`,
      );
      continue;
    }
    rmSync(".temp/input.json");
    rmSync(".temp/output.txt");
    return output;
  }
}

export class ProhibitedContentError extends Error {
  constructor() {
    super("Prohibited content detected and skipped.");
    this.name = "ProhibitedContentError";
  }
}
