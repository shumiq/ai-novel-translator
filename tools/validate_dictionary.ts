// Name: Validate Dictionary
// Description: Check for Japanese entries in the translation dictionary that may need updating
import { isJapanese } from "../utils/lang";
import novelData from "../novel_data.json";

for (const [key, entry] of Object.entries(novelData)) {
  const translations = (entry as { translations: string[] }).translations;
  const japaneseTranslations = translations.filter((t: string) =>
    isJapanese(t),
  );
  if (japaneseTranslations.length > 0) {
    for (const t of japaneseTranslations) {
      console.log(`${key}: ${t}`);
    }
  }
}
