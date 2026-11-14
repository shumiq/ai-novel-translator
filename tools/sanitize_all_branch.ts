// Name: Sanitize All (Titles)
// Description: Sanitize translated HTML and refresh JSON across all titles
import { execSync } from "child_process";
import { join } from "path";
import { appRoot } from "../config";
import { Logger } from "../utils/logger";
import { forEachTitle } from "../utils/title";

async function main(): Promise<void> {
  let processed = 0;
  let failed = 0;

  await forEachTitle(async (id, dir) => {
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

      const status = execSync(
        "git status --porcelain -- books json novel_data.json",
        { cwd: dir, encoding: "utf-8" },
      );
      if (!status.trim()) {
        Logger.info(`No changes to commit for ${id}.`);
        return;
      }

      execSync("git add -- books json novel_data.json", { cwd: dir });
      execSync(`git commit -m ${JSON.stringify(`sanitize: ${id}`)}`, {
        cwd: dir,
      });
      Logger.info(`Committed sanitize changes for ${id}.`);
      processed++;
    } catch (raw) {
      failed++;
      const message = raw instanceof Error ? raw.message : String(raw);
      Logger.error(`Failed to sanitize ${id}: ${message}`);
    }
  });

  Logger.done(
    `Sanitized and committed ${processed} title(s), ${failed} failed`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  Logger.error(err.message);
  process.exit(1);
});
