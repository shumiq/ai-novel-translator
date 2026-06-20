import { execSync } from "child_process";
import { cpSync } from "fs";
import { novelConfig } from "./config";
import { preparation } from "./instructions/0_preparation";

preparation();

if (novelConfig.originalLanguage === "Japanese") {
  execSync(`bun merge_multiline_speech_jp.ts`, {
    encoding: "utf-8",
    stdio: "inherit",
  });
}

if (novelConfig.dictionaryPath) {
  cpSync("./novel_data.json", novelConfig.dictionaryPath);
}
