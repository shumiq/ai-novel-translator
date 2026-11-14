// Name: Sanitize All (Titles)
// Description: Sanitize translated HTML and refresh JSON across all titles
import { execSync } from "child_process";
import { appRoot } from "../config";
import { Logger } from "../utils/logger";
import { forEachTitle } from "../utils/title";

async function main(): Promise<void> {
  let processed = 0;
  let failed = 0;

  await forEachTitle(async (id) => {
    try {
      Logger.info(`Sanitizing ${id}...`);
      execSync("bun tools/sanitize_all.ts", {
        cwd: appRoot,
        stdio: "inherit",
        env: { ...process.env, NOVEL_TITLE: id },
      });

      Logger.info(`Finalizing ${id}...`);
      execSync("bun tools/finalize.ts", {
        cwd: appRoot,
        stdio: "inherit",
        env: { ...process.env, NOVEL_TITLE: id },
      });

      Logger.info(`Sanitized ${id}; changes staged but uncommitted.`);
      processed++;
    } catch (raw) {
      failed++;
      const message = raw instanceof Error ? raw.message : String(raw);
      Logger.error(`Failed to sanitize ${id}: ${message}`);
    }
  });

  Logger.done(`Sanitized ${processed} title(s), ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
