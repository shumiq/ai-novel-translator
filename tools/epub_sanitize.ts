// Name: EPUB Sanitize
// Description: Sanitize EPUB-generated HTML files (no Thai-specific replacements)
import { Glob } from "bun";
import { Logger } from "../utils/logger";
import { sanitizeFile } from "../utils/sanitize";

const glob = new Glob("books/**/*html");
const files = Array.from(glob.scanSync(".")) as string[];

Logger.info(`Sanitizing ${files.length} files...`);
files.toSorted().forEach((file) => {
  Logger.progress(`Processing ${file}`);
  sanitizeFile(file, { noReplace: true });
});
Logger.done(`Sanitized ${files.length} files`);
