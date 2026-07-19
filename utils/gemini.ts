import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { appConfig } from "../config";
import { Logger } from "./logger";
import { ensureTempDir } from "./temp";

const url = `https://generativelanguage.googleapis.com/v1beta/models/${appConfig.model.api}:generateContent`;

function getApiKey() {
  if (appConfig.apiKeys.length === 0) {
    Logger.error("No API keys provided in config.");
    process.exit(1);
  }
  const nonExpiredKeys = appConfig.apiKeys.filter(
    (key) => !existsSync(`.temp/${key}`),
  );
  if (nonExpiredKeys.length === 0) {
    appConfig.apiKeys.forEach((key) => {
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
}: {
  instruction: string;
  prompt: string;
  body?: object;
}) {
  ensureTempDir();
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
        thinkingLevel: appConfig.thinking,
      },
      temperature: 1.0,
      ...(additionalBody as any)?.generationConfig,
    },
  };

  // Loop to retry on 503 errors, which indicate the model is still loading
  let retryCount = 0;
  while (true) {
    Logger.debug(`Sending request to Gemini API`);
    const start = Date.now();
    const apiKey = getApiKey();
    if (!apiKey) {
      Logger.info("No available API keys. Falling back to Gemini CLI...");
      return geminiCliRequest({
        instruction,
        prompt,
        body: additionalBody,
      });
    }
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1000 * 60 * 60),
      // @ts-ignore - Bun-specific extension
      timeout: false,
      keepalive: true,
      verbose: appConfig.debug,
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
        if (retryCount > 5) {
          if (appConfig.skipHighDemand) throw new HighDemandError();
          return geminiCliRequest({
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
      if (response.status == 429) {
        Logger.error(
          "API key rate limit reached. Marking current key as used and retrying with next key...",
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

    if (JSON.stringify(data).includes("PROHIBITED_CONTENT")) {
      if (appConfig.skipProhibitedContent) {
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
  runner = "api-fallback-handler",
}: Parameters<typeof geminiRequest>[0] & { runner?: string }) {
  ensureTempDir();
  writeFileSync(
    ".temp/INSTRUCTION.md",
    [
      "You are operating in api-fallback-handler mode.",
      "CRITICAL: Do NOT output the result as text in the chat. You MUST use the Write tool to save your complete output directly to the file .temp/output.txt (always overwrite). Do NOT use echo, cat, or any other method — use the Write tool only.",
      "",
      ...instruction.split("\n").map((line) => line.trim()),
    ].join("\n"),
  );
  writeFileSync(
    ".temp/PROMPT.md",
    [
      "You are operating in api-fallback-handler mode.",
      "CRITICAL: Do NOT output the result as text in the chat. You MUST use the Write tool to save your complete output directly to the file .temp/output.txt (always overwrite). Do NOT use echo, cat, or any other method — use the Write tool only.",
      "",
      ...prompt.split("\n").map((line) => line.trim()),
      "",
      additionalBody
        ? `<reponse_format>\n${JSON.stringify(additionalBody, null, 2)}\n</reponse_format>`
        : "Output must be in HTML format with SAME number of lines as <original_text>",
    ].join("\n"),
  );
  writeFileSync(".temp/output.txt", "(empty)");
  let retryCount = 0;
  while (true) {
    try {
      const prompt =
        runner === "gemini"
          ? `agy --prompt "Follow instruction in .temp/PROMPT.md . Use the Write tool to save your output in .temp/output.txt"`
          : `opencode run "Act as api-fallback-handler agent. Read .temp/PROMPT.md and follow its instructions. You MUST use the Write tool to save your complete output to .temp/output.txt. Do NOT output text in chat." --model google/${appConfig.model.agent} --variant med --agent api-fallback-handler`;
      execSync(prompt, {
        stdio: "inherit",
        timeout: 1000 * 60 * 10,
        killSignal: "SIGKILL",
      });
      if (additionalBody) {
        const output = readFileSync(".temp/output.txt", "utf-8");
        if (!output) {
          writeFileSync(".temp/output.txt", JSON.stringify({}, null, 2));
        }
      }
    } catch {}
    const output = readFileSync(".temp/output.txt", "utf-8");
    if (output === "(empty)") {
      Logger.error(
        `Gemini CLI returned empty output. Retrying Gemini CLI request...`,
      );
      retryCount++;
      if (retryCount > 3) {
        Logger.error(
          `Gemini CLI returned empty output after 5 retries. Exiting.`,
        );
        rmSync(".temp/INSTRUCTION.md");
        rmSync(".temp/PROMPT.md");
        rmSync(".temp/output.txt");
        throw new HighDemandError();
      }
      continue;
    }
    rmSync(".temp/INSTRUCTION.md");
    rmSync(".temp/PROMPT.md");
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

export class HighDemandError extends Error {
  constructor() {
    super("High demand detected and skipped.");
    this.name = "HighDemandError";
  }
}
