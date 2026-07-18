import { cpSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { novelConfig } from "./config";
import { preparation } from "./instructions/0_preparation";
import { Logger } from "./utils/logger";

const episode = process.argv[2];

if (!episode) {
  Logger.error("Usage: bun revert.ts <episode>");
  process.exit(1);
}

const src = join(novelConfig.originalPath, `${episode}.json`);

if(!novelConfig.originalPath) {
  Logger.error("Original path is not defined in novelConfig.");
  process.exit(1);
}

if (!existsSync(novelConfig.originalPath)) {
  Logger.error(`Original path does not exist: ${novelConfig.originalPath}`);
  process.exit(1);
}

if (!existsSync(src)) {
  Logger.error(`Source file does not exist: ${src}`);
  process.exit(1);
}

cpSync(src, join("./json", `${episode}.json`));
Logger.info(`Copied: ${src} → json/${episode}.json`);

const htmlPath = join("./books", `${episode}.html`);
if (existsSync(htmlPath)) {
  unlinkSync(htmlPath);
  Logger.info(`Deleted: ${htmlPath}`);
}

await preparation();
