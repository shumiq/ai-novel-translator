// Name: Adjust English Lines
// Description: Adjust English lines in HTML files by applying sanitization rules
import { readFileSync, writeFileSync } from "fs";
import { adjustEnglishLines } from "../utils/sanitize";

const targetFiles: string[] = [];

targetFiles.forEach((file) => {
  const rawHtml = readFileSync(file, "utf-8").trim();
  const result = adjustEnglishLines(rawHtml);
  writeFileSync(file, result, "utf-8");
});
