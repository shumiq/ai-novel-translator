// Name: Validate Dictionary
// Description: Check for Japanese entries in the translation dictionary that may need updating
import { readFileSync } from "fs";
import { isJapanese } from "../utils/lang";
import { useActiveTitle } from "../utils/title";

useActiveTitle();

const novelData = JSON.parse(
  readFileSync("novel_data.json", "utf-8"),
) as Record<string, { translations?: string[] }>;

for (const [key, entry] of Object.entries(novelData)) {
  const translations = entry.translations ?? [];
  const japaneseTranslations = translations.filter((t: string) =>
    isJapanese(t),
  );
  if (japaneseTranslations.length > 0) {
    for (const t of japaneseTranslations) {
      console.log(`${key}: ${t}`);
    }
  }
}
