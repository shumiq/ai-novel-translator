import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { novelConfig } from "../config";
import { Logger } from "./logger";
import type { Dictonary } from "./types";

export interface ExtractOptions {
  searchByThai?: boolean; // Search by Thai translation value instead of original key
  genderOnly?: boolean; // Only include entries that have a `gender` field
}

/** Absolute path of the active title's dictionary (novelConfig.dictionaryPath). */
export function dictionaryPath(): string {
  if (!novelConfig.dictionaryPath) {
    throw new Error(
      "novelConfig.dictionaryPath is not set. Add it to the title's novel_config.json.",
    );
  }
  return novelConfig.dictionaryPath;
}

/** Read the dictionary from disk, returning {} when the file does not exist. */
export function readDictionary(): Dictonary {
  const path = dictionaryPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8") || "{}") as Dictonary;
}

/** Write the dictionary to disk, creating parent directories if needed. */
export function writeDictionary(data: Dictonary): void {
  const path = dictionaryPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/** Stage the dictionary in its own repo (best-effort; never commits). */
export function stageDictionary(): void {
  const path = dictionaryPath();
  try {
    execFileSync("git", ["add", "--", path], { cwd: dirname(path) });
  } catch (e) {
    Logger.debug(`Could not stage dictionary: ${e}`);
  }
}

export function extractExistedWords(content: string, options?: ExtractOptions) {
  const dictionary = readDictionary();
  const entries = Object.entries(dictionary);
  const contentLower = content.toLowerCase();
  const existedWords = entries.filter(([key, value]) => {
    // Gender-only filter: skip entries without a gender field
    if (options?.genderOnly && !("gender" in value && value.gender)) {
      return false;
    }

    // Search mode: match against Thai translations or original key
    if (options?.searchByThai && value.translations[0]) {
      const thaiKey = value.translations[0].toLowerCase();
      if (contentLower.includes(thaiKey)) return true;
      if (
        thaiKey
          .split(/[\s,.:=＝・、。“”　]+/)
          .filter((part) => part.length > 1)
          .some((part) => contentLower.includes(part))
      )
        return true;
    } else {
      if (contentLower.includes(key)) return true;
      if (
        key
          .split(/[\s,.:=＝・、の屋派家伯男様族。“”　]+/)
          .filter((part) => part.length > 1)
          .some((part) => contentLower.includes(part))
      )
        return true;
    }
    return false;
  });
  Logger.debug(
    `Found ${existedWords.length} existing words in the content: ${existedWords.map(([key, value]) => `${value.translations[0]}`).join(", ")}`,
  );
  return Object.fromEntries(existedWords);
}
