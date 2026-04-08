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

export async function preparation() {
  // #1. check if all config.ts has been set up, if not, prompt the user to set up and exit the process.
  {
    if (!config.originalPath) {
      console.error("Please set up config.originalPath in config.ts");
      process.exit(1);
    }
    if (!existsSync(config.originalPath)) {
      console.error(
        `The path ${config.originalPath} does not exist. Please check your config.originalPath in config.ts`,
      );
      process.exit(1);
    }
    if (!config.outputPath) {
      console.error("Please set up config.outputPath in config.ts");
      process.exit(1);
    }
    if (!config.title) {
      console.error("Please set up config.title in config.ts");
      process.exit(1);
    }
    if (!existsSync(config.outputPath)) {
      mkdirSync(config.outputPath, { recursive: true });
    }
    if (!existsSync("./json")) {
      mkdirSync("./json");
    }
    if (!existsSync("./books")) {
      mkdirSync("./books");
    }
    if (!existsSync("./novel_data.json")) {
      writeFileSync("./novel_data.json", "{}");
    }
    if (!existsSync("./skip.txt")) {
      writeFileSync("./skip.txt", "");
    }
  }
  // #2. copy all json from config.outputPath to json folder
  {
    const files = readdirSync(config.outputPath).filter((file) =>
      file.endsWith(".json"),
    );
    files.forEach(async (file) => {
      const srcPath = join(config.outputPath, file);
      const destPath = join("json", file);
      if (!existsSync(destPath)) {
        console.log(`Copying ${file} from outputPath to json folder...`);
        cpSync(srcPath, destPath);
        console.log(`Copied: ${file}`);
      }
    });
  }
  // #3. copy all json from config.originalPath to json folder, only if the json file does not exist in json folder, to avoid overwriting the extracted data.
  {
    const files = readdirSync(config.originalPath).filter((file) =>
      file.endsWith(".json"),
    );
    files.forEach(async (file) => {
      const srcPath = join(config.originalPath, file);
      const destPath = join("json", file);
      if (!existsSync(destPath)) {
        console.log(`Copying ${file} from originalPath to json folder...`);
        cpSync(srcPath, destPath);
        console.log(`Copied: ${file}`);
      }
    });
  }
  // #4. convert all json to html
  {
    const jsonFiles = readdirSync("./json");
    if (!existsSync("./books")) mkdirSync("./books");
    jsonFiles.forEach(async (file) => {
      if (
        file === "meta.json" ||
        existsSync(`./books/${file.replace(".json", ".html")}`)
      )
        return;
      console.log(`Converting ${file} to HTML...`);
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
        [data.title || "(empty)", ...lines]
          .map((line) => `<p>${line.trim()}</p>`)
          .join("\n"),
      );
    });
  }
}
