import { readFileSync } from "fs";
import type { Dictonary } from "./types";

export function extractExistedWords(content: string) {
  const dictionary = JSON.parse(
    readFileSync("novel_data.json", "utf-8") || "{}",
  ) as Dictonary;
  const entries = Object.entries(dictionary);
  const existedWords = entries.filter(([key, value]) => {
    if (content.includes(key)) return true;
    if (
      key
        .split(/[\s,.:=＝・、の屋派家伯男様族。“”　]+/)
        .filter((part) => part.length > 1)
        .some((part) => content.includes(part))
    )
      return true;
    return false;
  });
  return Object.fromEntries(existedWords);
}
