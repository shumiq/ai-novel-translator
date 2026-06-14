import { readFileSync, writeFileSync } from "fs";
import { adjustEnglishLines } from "./utils/sanitize";

const targetFiles: string[] = [];

targetFiles.forEach((file) => {
  const rawHtml = readFileSync(file, "utf-8").trim();
  const result = adjustEnglishLines(rawHtml);
  writeFileSync(file, result, "utf-8");
});
