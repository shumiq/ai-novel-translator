import { config } from "../config";
import { Logger } from "./logger";

export async function lmstudioRequest({
  instruction,
  prompt,
  body: additionalBody,
}: {
  instruction: string;
  prompt: string;
  body?: any;
}) {
  const body = {
    model: "qwen-3.5-9b",
    messages: [
      {
        role: "system",
        content: instruction,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 1.0,
    max_tokens: -1,
    thinking: "medium",
    ...(additionalBody?.generationConfig?.responseSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "novel_terminology_extract", // Required field for OpenAI/LM Studio
              strict: true, // Optional: Forces strict adherence
              schema: {
                ...(additionalBody?.generationConfig?.responseSchema || {}),
              },
            },
          },
        }
      : {}),
  };

  // Loop to retry on 503 errors, which indicate the model is still loading
  while (true) {
    const response = await fetch(`http://127.0.0.1:1234/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1000 * 60 * 60),
      // @ts-ignore - Bun-specific extension
      timeout: false,
      keepalive: true,
      verbose: config.debug,
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`API Error: ${response.status} - ${errorText}`);
      if (response.status == 503) {
        Logger.error("Retrying after 5 seconds...");
        await new Promise((res) => setTimeout(res, 5000));
        continue;
      }
      process.exit(1);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      Logger.error(`No choices returned from LM Studio`);
      Logger.error(`Response text: ${JSON.stringify(data)}`);
      continue;
    }

    // 2. The message is nested inside the first choice
    if (
      !data.choices[0].message ||
      !(
        data.choices[0].message.reasoning_content ||
        data.choices[0].message.content
      )
    ) {
      Logger.error(`No message content returned`);
      Logger.error(`Response text: ${JSON.stringify(data)}`);
      continue;
    }

    // 3. Extract the text
    const resultText: string =
      data.choices[0].message.reasoning_content ||
      data.choices[0].message.content;

    return resultText;
  }
}
