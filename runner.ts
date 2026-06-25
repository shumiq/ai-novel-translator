import { existsSync, writeFileSync } from "fs";
import { Logger } from "./utils/logger";
import { runnerAPI } from "./runner_api";
import { ensureTempDir, ensureSkipFile } from "./utils/temp";

Logger.info("Runner start");
ensureTempDir();
if (!existsSync("./novel_data.json")) {
  writeFileSync("./novel_data.json", "{}");
}
ensureSkipFile();

await runnerAPI();
