// Name: Runner
// Description: Pipeline entry point — sets up temp files and runs the 4-pass pipeline
import { existsSync, writeFileSync } from "fs";
import { Logger } from "../utils/logger";
import { ensureTempDir, ensureSkipFile } from "../utils/temp";
import { useActiveTitle } from "../utils/title";
import { runnerAPI } from "./runner_api";

useActiveTitle();
Logger.info("Runner start");
ensureTempDir();
ensureSkipFile();
if (!existsSync(".temp/humanized.txt")) {
  writeFileSync(".temp/humanized.txt", "");
}

await runnerAPI();
