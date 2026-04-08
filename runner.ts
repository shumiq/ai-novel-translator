import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { extraction } from "./instructions/1_extraction";
import { translation } from "./instructions/2_translation";
import { consistencyCheck } from "./instructions/3_consistency";
import { humanization } from "./instructions/4_humanization";
import { extractNonThai } from "./utils/extract";
import { isThai } from "./utils/lang";

if (!existsSync(".temp")) mkdirSync(".temp");

const LIMIT = 10;

(async () => {
  const files = extractNonThai();
  const skips = readFileSync("skip.txt", "utf-8");
  let count = 0;
  for (const file of files) {
    if (skips.includes(file)) {
      console.log(`Skipping: ${file}`);
      continue;
    }
    if (count++ >= LIMIT) process.exit(0);
    // Loop to ensure we only proceed to the next file after successful passes of the current file
    while (true) {
      // PASS-1: Extract high-impact terms using the API and update the dictionary
      if (!existsSync(`.temp/extraction_${file.replaceAll("/", "_")}`)) {
        await extraction(file);
      }

      // PASS-2: Translate the extracted terms using the API and update the dictionary with translations
      if (
        existsSync(`.temp/extraction_${file.replaceAll("/", "_")}`) &&
        !existsSync(`.temp/translated_${file.replaceAll("/", "_")}`)
      ) {
        await translation(file);
      }

      // PASS-3: Consistency check - Ensure the translated file has matched translated terms from the dictionary.
      if (
        existsSync(`.temp/translated_${file.replaceAll("/", "_")}`) &&
        !existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
      ) {
        await consistencyCheck(file);
      }

      // PASS-4: Humanize the translated text
      if (
        existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
      ) {
        await humanization(file);
      }

      // Final check to ensure the output file is in Thai before proceeding to the next file
      const finalOutputFile = `.temp/final_humanized_${file.replaceAll("/", "_")}`;

      if (
        existsSync(finalOutputFile) &&
        isThai(readFileSync(finalOutputFile, "utf-8"))
      ) {
        // Success! Overwrite the real file and clean up.
        writeFileSync(file, readFileSync(finalOutputFile, "utf-8"));

        if (existsSync(`.temp/extraction_${file.replaceAll("/", "_")}`))
          rmSync(`.temp/extraction_${file.replaceAll("/", "_")}`);
        if (existsSync(`.temp/translated_${file.replaceAll("/", "_")}`))
          rmSync(`.temp/translated_${file.replaceAll("/", "_")}`);
        if (
          existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
        )
          rmSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`);
        if (existsSync(finalOutputFile)) rmSync(finalOutputFile);

        console.log(`Successfully completed: ${file}`);

        execSync(`git add ${file}`);

        break; // Moves to the next file
      } else {
        console.error(
          `Final output is not completely in Thai. Restarting pipeline for ${file}`,
        );
        // Clean up temps to start completely fresh for Pass 2
        if (existsSync(`.temp/translated_${file.replaceAll("/", "_")}`))
          rmSync(`.temp/translated_${file.replaceAll("/", "_")}`);
        if (
          existsSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`)
        )
          rmSync(`.temp/consistency_checked_${file.replaceAll("/", "_")}`);
        if (existsSync(finalOutputFile)) rmSync(finalOutputFile);
      }
    }
  }
})();
