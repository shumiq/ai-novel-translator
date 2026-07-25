import { readFileSync } from "fs";
import { Logger } from "./logger";
import type { Dictonary } from "./types";

export interface ExtractOptions {
  searchByThai?: boolean; // Search by Thai translation value instead of original key
  genderOnly?: boolean; // Only include entries that have a `gender` field
}

export function extractExistedWords(content: string, options?: ExtractOptions) {
  const dictionary = JSON.parse(
    readFileSync("novel_data.json", "utf-8") || "{}",
  ) as Dictonary;
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
