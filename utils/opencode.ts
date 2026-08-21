import { execSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { appConfig } from "../config";
import { HighDemandError } from "./errors";
import { Logger } from "./logger";
import type { AIRequest } from "./types";
import { ensureTempDir } from "./temp";

export async function opencodeRequest({
  instruction,
  prompt,
  body: additionalBody,
}: AIRequest) {
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
      const prompt = `opencode run "Act as api-fallback-handler agent. Read .temp/PROMPT.md and follow its instructions. You MUST use the Write tool to save your complete output to .temp/output.txt. Do NOT output text in chat." --model ${appConfig.model.opencode} --variant med --agent api-fallback-handler`;
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
        `OpenCode returned empty output. Retrying OpenCode request...`,
      );
      retryCount++;
      if (retryCount > 3) {
        Logger.error(
          `OpenCode returned empty output after 3 retries. Exiting.`,
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
