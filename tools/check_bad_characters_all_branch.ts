// Name: Check Bad Characters (All Titles)
// Description: Check for bad/unwanted characters across translated titles
// Usage: bun tools/check_bad_characters_all_branch.ts [--all]
import { execSync } from "child_process";
import { existsSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { appRoot } from "../config";
import { Logger } from "../utils/logger";
import { forEachTitle } from "../utils/title";

const ALL = process.argv.includes("--all");

interface TitleIssue {
  title: string;
  output: string;
}

async function main(): Promise<void> {
  const issues: TitleIssue[] = [];
  let checked = 0;

  await forEachTitle(async (id, dir) => {
    const marker = join(dir, ".to_check_bad_character");
    if (!ALL && !existsSync(marker)) {
      Logger.info(`Skip ${id} (not marked for checking)`);
      return;
    }

    checked++;
    try {
      const output = execSync("bun tools/check_bad_characters.ts", {
        cwd: appRoot,
        encoding: "utf-8",
        env: { ...process.env, NOVEL_TITLE: id },
      });
      Logger.info(`${id}: No bad characters found.`);
      Logger.debug(output);
      if (existsSync(marker)) rmSync(marker, { force: true });
    } catch (err) {
      const output =
        err instanceof Error && "stdout" in err
          ? String((err as { stdout: unknown }).stdout)
          : err instanceof Error
            ? err.message
            : String(err);
      Logger.warn(`${id}: Found issues.`);
      issues.push({ title: id, output });
    }
  });

  if (checked === 0) {
    Logger.done("No titles to check.");
    return;
  }

  if (issues.length === 0) {
    Logger.done("No bad characters found in any title.");
    return;
  }

  const reportLines: string[] = [
    "# Bad Characters Report",
    "",
    `Checked ${checked} title(s).`,
    `Found issues in ${issues.length} title(s).`,
    "",
    "---",
    "",
  ];

  for (const issue of issues) {
    reportLines.push(`## Title: ${issue.title}`);
    reportLines.push("");
    reportLines.push("```");
    reportLines.push(issue.output.trim());
    reportLines.push("```");
    reportLines.push("");
  }

  const reportPath = join(appRoot, "check_bad_characters_report.md");
  writeFileSync(reportPath, reportLines.join("\n"), "utf-8");
  Logger.info(`Report written to ${reportPath}`);

  Logger.error(
    `Bad characters found in ${issues.length} title(s). See ${reportPath} for details.`,
  );
  process.exit(1);
}

main().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
