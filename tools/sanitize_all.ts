// Name: Sanitize All
// Description: Sanitize all translated Thai HTML files (normalize punctuation, quotes, etc.)
import { Glob } from "bun";
import { Logger } from "../utils/logger";
import { sanitizeFile } from "../utils/sanitize";
import { useActiveTitle } from "../utils/title";

useActiveTitle();
const glob = new Glob("books/**/*html");
const files = Array.from(glob.scanSync(".")) as string[];

Logger.info(`Sanitizing ${files.length} files...`);
files.toSorted().forEach((file) => {
  Logger.progress(`Processing ${file}`);
  sanitizeFile(file, { onlyThai: true });
});
Logger.done(`Sanitized ${files.length} files`);
