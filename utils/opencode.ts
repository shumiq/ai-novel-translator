import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appConfig, appRoot } from "../config";
import { HighDemandError } from "./errors";
import { Logger } from "./logger";
import type { AIRequest } from "./types";

const ioDir = join(appRoot, ".temp");
const instructionPath = join(ioDir, "INSTRUCTION.md");
const promptPath = join(ioDir, "PROMPT.md");
const outputPath = join(ioDir, "output.txt");

export async function opencodeRequest({
  instruction,
  prompt,
  body: additionalBody,
}: AIRequest) {
  mkdirSync(ioDir, { recursive: true });
  writeFileSync(
    instructionPath,
    [
      "You are operating in api-fallback-handler mode.",
      "CRITICAL: Do NOT output the result as text in the chat. You MUST use the Write tool to save your complete output directly to the file .temp/output.txt (always overwrite). Do NOT use echo, cat, or any other method — use the Write tool only.",
      "",
      ...instruction.split("\n").map((line) => line.trim()),
    ].join("\n"),
  );
  writeFileSync(
    promptPath,
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
  writeFileSync(outputPath, "(empty)");
  let retryCount = 0;
  while (true) {
    try {
      const command = `opencode run "Act as api-fallback-handler agent. Read .temp/PROMPT.md and follow its instructions. You MUST use the Write tool to save your complete output to .temp/output.txt. Do NOT output text in chat." --auto --model ${appConfig.model.opencode} --agent api-fallback-handler`;
      execSync(command, {
        cwd: appRoot,
        stdio: "inherit",
        timeout: 1000 * 60 * 10,
        killSignal: "SIGKILL",
      });
      if (additionalBody) {
        const output = readFileSync(outputPath, "utf-8");
        if (!output) {
          writeFileSync(outputPath, JSON.stringify({}, null, 2));
        }
      }
    } catch {}
    const output = readFileSync(outputPath, "utf-8");
    if (output === "(empty)") {
      Logger.error(
        `OpenCode returned empty output. Retrying OpenCode request...`,
      );
      retryCount++;
      if (retryCount > 3) {
        Logger.error(
          `OpenCode returned empty output after 3 retries. Exiting.`,
        );
        rmSync(instructionPath);
        rmSync(promptPath);
        rmSync(outputPath);
        throw new HighDemandError();
      }
      continue;
    }
    rmSync(instructionPath);
    rmSync(promptPath);
    rmSync(outputPath);
    return output;
  }
}
