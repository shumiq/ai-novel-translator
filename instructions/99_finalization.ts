import { execSync } from "child_process";
import { cpSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { JSDOM } from "jsdom";
import { join } from "path";
import { config } from "../config";
import { isThai } from "../utils/lang";
import { Logger } from "../utils/logger";

export async function finalization() {
  // #1. convert all html to json
  {
    const meta = JSON.parse(readFileSync("./json/meta.json", "utf-8")) as {
      id: string;
      title: string;
      chapters: {
        ch: number;
        name: string;
      }[];
    };
    const htmlFiles = readdirSync("./books");
    htmlFiles.forEach(async (file) => {
      const ch = Number(file.split(".")[0]);
      if (isNaN(ch)) return;
      const rawHtml = readFileSync(`./books/${file}`, "utf-8");
      if (!isThai(rawHtml)) return;
      const title =
        new JSDOM(rawHtml).window.document.querySelector("p")?.textContent ||
        "";
      const json = {
        title,
        content: rawHtml
          .split("\n")
          .slice(1)
          .join("\n")
          .replaceAll("\r\n", "\n"),
      };
      writeFileSync(`./json/${ch}.json`, JSON.stringify(json, null, 2));
      Logger.progress(`Converted ${file} to JSON`);
      const chapter = meta.chapters.find((c) => c.ch === ch);
      if (chapter) {
        chapter.name = title;
      } else {
        meta.chapters.push({
          ch: ch,
          name: title,
        });
      }
    });
    meta.chapters = meta.chapters.toSorted((a, b) => a.ch - b.ch);
    meta.title = config.title;
    if (!meta.id.endsWith("-thai")) {
      meta.id = `${meta.id}-thai`;
    }
    writeFileSync("./json/meta.json", JSON.stringify(meta, null, 2));
  }
  // #2. git add all json
  {
    execSync(`git add json`);
  }
  // #3. copy all json from json folder to config.outputPath, overwrite if exists.
  {
    const files = readdirSync("./json").filter((file) =>
      file.endsWith(".json"),
    );
    Logger.info(`Found ${files.length} JSON files to copy`);
    // Copy each file to destination
    await Promise.all(
      files.map(async (file) => {
        const srcPath = join("./json", file);
        const destPath = join(config.outputPath, file);
        cpSync(srcPath, destPath);
        Logger.progress(`Copied: ${file}`);
      }),
    );
  }
  // #4. copy dictionary
  {
    cpSync("./novel_data.json", config.dictionaryPath);
    Logger.info(`Copied: ./novel_data.json to ${config.dictionaryPath}`);
  }
}
