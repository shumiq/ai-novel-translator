import { Glob } from "bun";
import { existsSync, readdirSync, readFileSync } from "fs";
import { JSDOM } from "jsdom";
import path from "path";
import { isThai } from "./lang";

const glob = new Glob("books/**/*html");

export function extractNonThai(progressFile?: string) {
  const files = (Array.from(glob.scanSync(".")) as string[]).map((file) =>
    file.replaceAll("\\", "/"),
  );
  const filterOut =
    progressFile && existsSync(progressFile)
      ? readFileSync(progressFile, "utf-8")
      : "";
  return files
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
    })
    .sort((a, b) =>
      a.split("/").length > 2
        ? a.localeCompare(b)
        : Number(a.replaceAll(/[^0-9]/g, "")) -
          Number(b.replaceAll(/[^0-9]/g, "")),
    );
}

export function extractThai(progressFile?: string) {
  const files = (Array.from(glob.scanSync(".")) as string[]).map((file) =>
    file.replaceAll("\\", "/"),
  );
  const filterOut =
    progressFile && existsSync(progressFile)
      ? readFileSync(progressFile, "utf-8")
      : "";
  return files
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
    })
    .sort((a, b) =>
      a.split("/").length > 2
        ? a.localeCompare(b)
        : Number(a.replaceAll(/[^0-9]/g, "")) -
          Number(b.replaceAll(/[^0-9]/g, "")),
    );
}

export function getPreviousChapterContent(file: string, last = 10) {
  const files = (Array.from(glob.scanSync(".")) as string[])
    .map((file) => file.replaceAll("\\", "/"))
    .sort((a, b) =>
      a.split("/").length > 2
        ? a.localeCompare(b)
        : Number(a.replaceAll(/[^0-9]/g, "")) -
          Number(b.replaceAll(/[^0-9]/g, "")),
    );
  const index = files.indexOf(file);
  if (index <= 0 || !files[index - 1]) return "";
  const previousChapterContent = readFileSync(files[index - 1]!, "utf-8");
  return previousChapterContent.split("\n").slice(-last).join("\n");
}
