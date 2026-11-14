// Name: Switch Title
// Description: Select the active novel title, creating a new title folder when needed
// Usage: bun tools/switch_title.ts [web/slug|epub/slug]
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { createInterface } from "node:readline/promises";
import { join } from "path";
import { appRoot, TITLE_ID_RE } from "../config";
import { Logger } from "../utils/logger";
import { listTitles, titleDir } from "../utils/title";
import type { NovelConfig } from "../utils/types";

function writeActiveTitle(id: string): void {
  writeFileSync(join(appRoot, ".active_title"), `${id}\n`);
}

async function createTitle(id: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question: string, fallback = ""): Promise<string> => {
    const answer = await rl.question(
      `${question}${fallback ? ` [${fallback}]` : ""}: `,
    );
    return answer.trim() || fallback;
  };

  const originalPath = await ask("Original source path (empty for EPUB)");
  const outputPath = await ask("Output JSON path (empty for EPUB)");
  const dictionaryPath = await ask("Dictionary path (empty for none)");
  const title = await ask("Title");
  const originalLanguage = await ask("Original language", "Japanese");
  const additionalContext = await ask(
    "Additional context (comma separated, optional)",
  );
  rl.close();

  const config: NovelConfig = {
    originalPath,
    outputPath,
    dictionaryPath,
    title,
    originalLanguage,
    additionalContext: additionalContext
      ? additionalContext.split(",").map((s) => s.trim())
      : [],
  };

  const dir = titleDir(id);
  mkdirSync(join(dir, "books"), { recursive: true });
  mkdirSync(join(dir, "json"), { recursive: true });
  const dictionary = join(dir, "novel_data.json");
  if (!existsSync(dictionary)) writeFileSync(dictionary, "{}\n");
  writeFileSync(
    join(dir, "novel_config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );

  Logger.info(`Created new title ${id}`);
}

async function main(): Promise<void> {
  const arg = process.argv[2];

  if (arg) {
    if (!TITLE_ID_RE.test(arg)) {
      throw new Error(`Invalid title id: ${JSON.stringify(arg)}`);
    }
    if (!existsSync(join(titleDir(arg), "novel_config.json"))) {
      await createTitle(arg);
    }
    writeActiveTitle(arg);
    Logger.done(`Active title: ${arg}`);
    return;
  }

  const titles = listTitles();
  if (titles.length === 0) {
    Logger.info("No titles found in the data worktree.");
  } else {
    console.log("\n  Available titles:\n");
    titles.forEach((id, index) => console.log(`    ${index + 1}. ${id}`));
    console.log("");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question("Select title (number or type/slug): ")
  ).trim();
  rl.close();

  const byNumber = Number(answer);
  const id =
    Number.isInteger(byNumber) && byNumber >= 1 ? titles[byNumber - 1] : answer;

  if (!id || !TITLE_ID_RE.test(id)) {
    throw new Error(`Invalid title id: ${JSON.stringify(answer)}`);
  }
  if (!existsSync(join(titleDir(id), "novel_config.json"))) {
    await createTitle(id);
  }
  writeActiveTitle(id);
  Logger.done(`Active title: ${id}`);
}

main().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
