import { Glob } from "bun";
import { sanitizeFile } from "./utils/sanitize";
import { Logger } from "./utils/logger";

const glob = new Glob("books/**/*html");
const files = Array.from(glob.scanSync(".")) as string[];

Logger.info(`Sanitizing ${files.length} files...`);
files.toSorted().forEach((file) => {
  Logger.progress(`Processing ${file}`);
  sanitizeFile(file);
});
