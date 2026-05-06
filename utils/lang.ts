import { config } from "../config";

export const isJapanese = (text: string) =>
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text);

export const isThai = (text: string) =>
  /\p{Script=Thai}/u.test(text) &&
  (config.language !== "Japanese" ||
    text.split(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u)
      .length < 100) &&
  (config.language !== "English" ||
    text
      .split("\n")
      .map((line) => line.replaceAll("<p>", "").replaceAll("</p>", "").trim())
      .filter(
        (line) =>
          line.trim() &&
          !/\p{Script=Thai}/u.test(line) &&
          /\p{Script=Latin}/u.test(line),
      ).length < 10);

export const isEnglish = (text: string) => {
  return (
    text
      .replaceAll(/\p{Script=Latin}{3,}/gu, "this-is-english")
      .split("this-is-english").length > 3
  );
};
