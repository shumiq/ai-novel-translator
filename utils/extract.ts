import { existsSync, readdirSync, readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { isThai } from "./lang";

export function extractNonThai(progressFile?: string) {
  const files = readdirSync("books", { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".html"))
    .map((dirent) => `books/${dirent.name}`);
  const filterOut =
    progressFile && existsSync(progressFile)
      ? readFileSync(progressFile, "utf-8")
      : "";
  return files
    .sort(
      (a, b) =>
        Number(a.replaceAll(/[^0-9]/g, "")) -
        Number(b.replaceAll(/[^0-9]/g, "")),
    )
    .filter((file) => {
      if (!file.endsWith("html") || filterOut.includes(file)) return false;
      const rawHTML = readFileSync(file, "utf-8");
      if (isThai(rawHTML)) return false;
      const document = new JSDOM(rawHTML).window.document;
      const lines: string[] = Array.from(document.querySelectorAll("p"))
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      if (lines.length === 0) return false;
      return true;
    });
}

export function extractThai(progressFile?: string) {
  const files = readdirSync("books", { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".html"))
    .map((dirent) => `books/${dirent.name}`);
  const filterOut =
    progressFile && existsSync(progressFile)
      ? readFileSync(progressFile, "utf-8")
      : "";
  return files
    .sort(
      (a, b) =>
        Number(a.replaceAll(/[^0-9]/g, "")) -
        Number(b.replaceAll(/[^0-9]/g, "")),
    )
    .filter((file) => {
      if (!file.endsWith("html") || filterOut.includes(file)) return false;
      const rawHTML = readFileSync(file, "utf-8");
      if (!isThai(rawHTML)) return false;
      const document = new JSDOM(rawHTML).window.document;
      const lines: string[] = Array.from(document.querySelectorAll("p"))
        .map((el) => el.textContent.trim())
        .filter(Boolean);
      if (lines.length === 0) return false;
      return true;
    });
}
