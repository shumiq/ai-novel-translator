// Name: Translate Leftover
// Description: Translate leftover English/Japanese text in translated Thai HTML files to Thai (auto-detects from config)
import { novelConfig } from "../config";
import {
  translateLeftoverEnglish,
  translateLeftoverJapanese,
} from "../utils/translate_leftover";
import { useActiveTitle } from "../utils/title";

useActiveTitle();
if (novelConfig.originalLanguage === "Japanese") {
  translateLeftoverJapanese();
} else {
  translateLeftoverEnglish();
}
