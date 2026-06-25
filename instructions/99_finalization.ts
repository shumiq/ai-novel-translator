import { execSync } from "child_process";
import { existsSync, cpSync } from "fs";
import { cp, readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { novelConfig } from "../config";
import { isThai } from "../utils/lang";
import { Logger } from "../utils/logger";
import { extractTitleFromHtml } from "../utils/text";

export async function finalization() {
  Logger.step("📦", "Finalization");

  // ── #1. convert all html to json ─────────────────────────────────
  Logger.info("Convert HTML to JSON");

  const metaExists = existsSync("./json/meta.json");
  const meta = metaExists
    ? (JSON.parse(await readFile("./json/meta.json", "utf-8")) as {
        id: string;
        title: string;
        chapters: { ch: number; name: string }[];
      })
    : null;

  if (meta) {
    const htmlFiles = await readdir("./books");
    const toConvert = htmlFiles.filter((f) => !isNaN(Number(f.split(".")[0])));

    if (toConvert.length > 0) {
      await Promise.all(
        toConvert.map(async (file) => {
          const rawHtml = await readFile(`./books/${file}`, "utf-8");
          if (!isThai(rawHtml)) return;

          // The HTML format is always <p>line</p> per line – no JSDOM needed.
          const lines = rawHtml.replaceAll("\r\n", "\n").split("\n");
          const title = extractTitleFromHtml(rawHtml);
          const content = lines.slice(1).join("\n");

          const ch = Number(file.split(".")[0]);
          await writeFile(
            `./json/${ch}.json`,
            JSON.stringify({ title, content }, null, 2),
          );
          Logger.progress(`Converted ${file} to JSON`);

          const chapter = meta.chapters.find((c) => c.ch === ch);
          if (chapter) {
            chapter.name = title;
          } else {
            meta.chapters.push({ ch, name: title });
          }
        }),
      );

      // Write updated meta.json once
      meta.chapters = meta.chapters.toSorted((a, b) => a.ch - b.ch);
      meta.title = novelConfig.title;
      if (!meta.id.endsWith("-thai")) {
        meta.id = `${meta.id}-thai`;
      }
      await writeFile("./json/meta.json", JSON.stringify(meta, null, 2));
    }
  }

  // ── #2. git add all json ─────────────────────────────────────────
  Logger.info("Git add JSON files");
  if (existsSync("./json")) {
    execSync(`git add json`);
  }

  // ── #3. copy all json from json folder to config.outputPath ──────
  Logger.info("Copy JSON to output path");
  if (
    existsSync("./json") &&
    novelConfig.outputPath &&
    existsSync(novelConfig.outputPath)
  ) {
    const files = await readdir("./json");
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    Logger.info(`Found ${jsonFiles.length} JSON files to copy`);

    if (jsonFiles.length > 0) {
      await Promise.all(
        jsonFiles.map(async (file) => {
          const src = join("./json", file);
          const dest = join(novelConfig.outputPath, file);
          await cp(src, dest);
          Logger.progress(`Copied: ${file}`);
        }),
      );
    }
  }

  // ── #4. copy dictionary ──────────────────────────────────────────
  if (novelConfig.dictionaryPath) {
    cpSync("./novel_data.json", novelConfig.dictionaryPath);
    Logger.info(`Copied: ./novel_data.json to ${novelConfig.dictionaryPath}`);
  }

  Logger.done("Finalization complete");
}
