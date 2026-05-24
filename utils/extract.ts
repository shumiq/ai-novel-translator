import { Glob } from "bun";
import { readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { appConfig } from "../config";
import { isThai } from "./lang";

const glob = new Glob("books/**/*html");

const allFiles = (Array.from(glob.scanSync(".")) as string[])
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

export function extractNonThai() {
  return allFiles
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
  return allFiles.filter((file) => {
    const rawHTML = readFileSync(file, "utf-8");
    if (!isThai(rawHTML)) return false;
    return true;
  });
}

export function getPreviousChapterContent(
  file: string,
  last = appConfig.previousChunk,
) {
  const files = (Array.from(glob.scanSync(".")) as string[])
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => {
      if (!file.endsWith("html")) return false;
      const rawHTML = readFileSync(file, "utf-8");
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
  const index = files.indexOf(file);
  if (index <= 0 || !files[index - 1]) return "";
  const previousChapterContent = readFileSync(files[index - 1]!, "utf-8");
  return previousChapterContent.split("\n").slice(-last).join("\n");
}
