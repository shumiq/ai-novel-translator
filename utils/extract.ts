import { Glob } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { JSDOM } from "jsdom";
import { appConfig } from "../config";
import { isThai } from "./lang";

const glob = new Glob("books/**/*html");

export function getAllFiles(options?: { force?: boolean }) {
  if (existsSync(".temp/novel_files.json") && !options?.force) {
    return JSON.parse(readFileSync(".temp/novel_files.json", "utf-8")) as string[];
  }
  const files = (Array.from(glob.scanSync(".")) as string[])
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => {
      const rawHTML = readFileSync(file, "utf-8");
      const body = new JSDOM(rawHTML).window.document.body.textContent;
      const lines: string[] = body
        .split("\n")
        .map((el) => el.trim())
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
  writeFileSync(".temp/novel_files.json", JSON.stringify(files, null, 2));
  return files;
}

export function extractNonThai() {
  return getAllFiles()
    .filter((file) => {
      const rawHTML = readFileSync(file, "utf-8");
      if (isThai(rawHTML)) return false;
      return true;
    })
    .sort((a, b) =>
      a.split("/").length > 2
        ? a.localeCompare(b)
        : Number(a.replaceAll(/[^0-9]/g, "")) -
          Number(b.replaceAll(/[^0-9]/g, "")),
    );
}

export function extractThai() {
  return getAllFiles().filter((file) => {
    const rawHTML = readFileSync(file, "utf-8");
    if (!isThai(rawHTML)) return false;
    return true;
  });
}

export function getPreviousChapterContent(
  file: string,
  last = appConfig.previousChunk,
) {
  const files = getAllFiles();
  const index = files.indexOf(file);
  if (index <= 0 || !files[index - 1]) return "";
  const previousChapterContent = readFileSync(files[index - 1]!, "utf-8");
  return previousChapterContent.split("\n").slice(-last).join("\n");
}
