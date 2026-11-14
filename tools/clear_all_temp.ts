// Name: Clear All Temp
// Description: Delete all .temp directories (pipeline state and agent IO)
// Usage: bun tools/clear_all_temp.ts [--dry-run]
import { existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { appRoot, novelDataRoot } from "../config";
import { Logger } from "../utils/logger";

const DRY_RUN = process.argv.includes("--dry-run");

function titleDirs(): string[] {
  const dirs: string[] = [];
  for (const type of ["web", "epub"]) {
    const typeDir = join(novelDataRoot, type);
    if (!existsSync(typeDir)) continue;
    for (const name of readdirSync(typeDir)) {
      const dir = join(typeDir, name);
      if (existsSync(join(dir, ".temp"))) dirs.push(dir);
    }
  }
  return dirs;
}

const dirs = [appRoot, ...titleDirs()];
let cleared = 0;

for (const dir of dirs) {
  const temp = join(dir, ".temp");
  if (!existsSync(temp)) continue;

  if (DRY_RUN) {
    Logger.info(`Would remove ${temp}`);
  } else {
    rmSync(temp, { recursive: true, force: true });
    Logger.info(`Removed ${temp}`);
  }
  cleared++;
}

Logger.done(
  `${DRY_RUN ? "Would clear" : "Cleared"} ${cleared} temp director${cleared === 1 ? "y" : "ies"}`,
);
