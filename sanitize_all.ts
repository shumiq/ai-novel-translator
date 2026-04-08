import { Glob } from "bun";
import { sanitizeFile } from "./utils/sanitize";

const glob = new Glob("books/**/*html");
const files = Array.from(glob.scanSync(".")) as string[];

files.toSorted().forEach((file) => {
  sanitizeFile(file);
});
