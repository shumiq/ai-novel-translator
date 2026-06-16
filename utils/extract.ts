import { Glob } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { JSDOM } from "jsdom";
import { appConfig } from "../config";
import { isThai } from "./lang";

const glob = new Glob("books/**/*html");

function chapterSortFn(a: string, b: string) {
  const isEpub = a.split("/").length > 2; // crude check for epub vs web
  if (!isEpub) {
    return (
      Number(a.replaceAll(/[^0-9]/g, "0")) -
      Number(b.replaceAll(/[^0-9]/g, "0"))
    );
  }
  const aPath = a.split("/").slice(0, -1).join("/");
  const aFile = a.split("/").slice(-1)[0]!;
  const bPath = b.split("/").slice(0, -1).join("/");
  const bFile = b.split("/").slice(-1)[0]!;
  if (aPath !== bPath) {
    return aPath.localeCompare(bPath);
  }
  const opf = aPath.split("/").slice(0, 2).join("/") + "/content.opf";
  if (existsSync(opf)) {
    const rawOPF = readFileSync(opf, "utf-8");
    return rawOPF.indexOf(aFile) - rawOPF.indexOf(bFile);
  } else {
    return (
      Number(aFile.replaceAll(/[^0-9]/g, "0")) -
      Number(bFile.replaceAll(/[^0-9]/g, "0"))
    );
  }
}

export function getAllFiles(options?: { force?: boolean }) {
  if (existsSync(".temp/novel_files.json") && !options?.force) {
    return JSON.parse(
      readFileSync(".temp/novel_files.json", "utf-8"),
    ) as string[];
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
    .sort(chapterSortFn);
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
    .sort(chapterSortFn);
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
