import { existsSync, mkdirSync, writeFileSync } from "fs";
import { runnerAPI } from "./runner_api";

if (!existsSync(".temp")) {
  mkdirSync(".temp");
}
if (!existsSync("./novel_data.json")) {
  writeFileSync("./novel_data.json", "{}");
}
if (!existsSync("./.temp/skip.txt")) {
  writeFileSync("./.temp/skip.txt", "");
}

await runnerAPI();
