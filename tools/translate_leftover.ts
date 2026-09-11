// Name: Translate Leftover
// Description: Translate leftover English/Japanese text in translated Thai HTML files to Thai (auto-detects from config)
import { novelConfig } from "../config";
import {
  translateLeftoverEnglish,
  translateLeftoverJapanese,
} from "../utils/translate_leftover";

if (novelConfig.originalLanguage === "Japanese") {
  translateLeftoverJapanese();
} else {
  translateLeftoverEnglish();
}
