import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { JSDOM } from "jsdom";
import { join } from "path";
import { config } from "../config";
import { Logger } from "../utils/logger";

export async function preparation() {
  // #1. check if all config.ts has been set up, if not, prompt the user to set up and exit the process.
  {
    if (config.outputPath && !existsSync(config.outputPath)) {
      mkdirSync(config.outputPath, { recursive: true });
    }
    if (!existsSync("./json")) {
      mkdirSync("./json");
    }
    if (!existsSync("./books")) {
      mkdirSync("./books");
    }
    if (!existsSync("./novel_data.json")) {
      if (config.dictionaryPath && existsSync(config.dictionaryPath)) {
        cpSync(config.dictionaryPath, "./novel_data.json");
        Logger.info(`Copied: ${config.dictionaryPath} to novel_data.json`);
      } else {
        Logger.warn(
          `The dictionary file ${config.dictionaryPath} does not exist. A new novel_data.json file will be created.`,
        );
        writeFileSync("./novel_data.json", "{}");
      }
    }
    if (!existsSync("./skip.txt")) {
      writeFileSync("./skip.txt", "");
    }
  }
  // #2. copy all json from config.outputPath to json folder
  if (config.outputPath && existsSync(config.outputPath)) {
    const files = readdirSync(config.outputPath).filter((file) =>
      file.endsWith(".json"),
    );
    files.forEach(async (file) => {
      const srcPath = join(config.outputPath, file);
      const destPath = join("json", file);
      if (!existsSync(destPath)) {
        cpSync(srcPath, destPath);
        Logger.progress(`Copied: ${file}`);
      }
    });
  }
  // #3. copy all json from config.originalPath to json folder, only if the json file does not exist in json folder, to avoid overwriting the extracted data.
  if (config.originalPath && existsSync(config.originalPath)) {
    const files = readdirSync(config.originalPath).filter((file) =>
      file.endsWith(".json"),
    );
    files.forEach(async (file) => {
      const srcPath = join(config.originalPath, file);
      const destPath = join("json", file);
      if (!existsSync(destPath)) {
        cpSync(srcPath, destPath);
        Logger.progress(`Copied: ${file}`);
      }
    });
    if (
      existsSync("./json/meta.json") &&
      existsSync(join(config.originalPath, "meta.json"))
    ) {
      const data = JSON.parse(
        readFileSync(join(config.originalPath, "meta.json"), "utf-8"),
      ) as {
        id: string;
        title: string;
        chapters: { ch: number; name: string }[];
      };
      const meta = JSON.parse(readFileSync("./json/meta.json", "utf-8")) as {
        id: string;
        title: string;
        chapters: { ch: number; name: string }[];
      };
      for (const chapter of data.chapters) {
        if (!meta.chapters.some((c) => c.ch === chapter.ch)) {
          meta.chapters.push(chapter);
        }
      }
      writeFileSync("./json/meta.json", JSON.stringify(meta, null, 2));
    }
  }
  // #4. convert all json to html
  const meta = JSON.parse(readFileSync("./json/meta.json", "utf-8")) as {
    id: string;
    title: string;
    chapters: { ch: number; name: string }[];
  };
  if (existsSync("./json")) {
    const jsonFiles = readdirSync("./json").filter((file) =>
      file.endsWith(".json"),
    );
    if (!existsSync("./books")) mkdirSync("./books");
    jsonFiles.forEach(async (file) => {
      if (
        file === "meta.json" ||
        existsSync(`./books/${file.replace(".json", ".html")}`)
      )
        return;
      Logger.progress(`Converting ${file} to HTML...`);
      const data = JSON.parse(readFileSync(`./json/${file}`, "utf-8")) as {
        title: string;
        content: string;
      };
      const document = new JSDOM(data.content).window.document;
      const lines: string[] = Array.from(document.body.querySelectorAll("p"))
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      writeFileSync(
        `./books/${file.replace(".json", ".html")}`,
        [
          data.title ||
            meta.chapters.find((c) => c.ch === Number(file.split(".")[0]))
              ?.name ||
            `ตอนที่ ${file.split(".")[0]}`,
          ...lines,
        ]
          .map((line) => `<p>${line.trim()}</p>`)
          .join("\n"),
      );
    });
  }
}
