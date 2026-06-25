import { existsSync, writeFileSync } from "fs";
import { runnerAPI } from "./runner_api";
import { ensureTempDir, ensureSkipFile } from "./utils/temp";

ensureTempDir();
if (!existsSync("./novel_data.json")) {
  writeFileSync("./novel_data.json", "{}");
}
ensureSkipFile();

await runnerAPI();
