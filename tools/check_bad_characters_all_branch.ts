// Name: Check Bad Characters (All Branches)
// Description: Check for bad/unwanted characters across all git web/* branches
import { execSync } from "child_process";
import { rmSync, writeFileSync } from "fs";
import { cleanGitState, execShell, getBranches } from "../utils/git";
import { Logger } from "../utils/logger";

const BRANCH_PREFIX = "web/*";

interface BranchIssue {
  branch: string;
  output: string;
}

async function main(): Promise<void> {
  const branches = getBranches(BRANCH_PREFIX);

  if (branches.length === 0) {
    Logger.info("No web/* branches found.");
    return;
  }

  Logger.info(`Found ${branches.length} web/* branches to check.`);

  await execShell("git checkout main -f");

  const issues: BranchIssue[] = [];

  for (const branch of branches) {
    rmSync(".temp", { recursive: true, force: true });
    cleanGitState();

    Logger.info(`Checking branch ${branch}...`);
    await execShell(`git checkout ${branch} -f`);
    cleanGitState();

    try {
      const output = execSync("bun tools/check_bad_characters.ts --all", {
        encoding: "utf-8",
      });
      Logger.info(`Branch ${branch}: No bad characters found.`);
      Logger.debug(output);
    } catch (err) {
      const output =
        err instanceof Error && "stdout" in err
          ? String((err as { stdout: unknown }).stdout)
          : err instanceof Error
            ? err.message
            : String(err);
      Logger.warn(`Branch ${branch}: Found issues.`);
      issues.push({ branch, output });
    }

    cleanGitState();
  }

  await execShell("git checkout main -f");

  if (issues.length === 0) {
    Logger.done("No bad characters found in any web/* branch.");
    return;
  }

  // Write report
  const reportLines: string[] = [
    "# Bad Characters Report",
    "",
    `Checked ${branches.length} web/* branches.`,
    `Found issues in ${issues.length} branch(es).`,
    "",
    "---",
    "",
  ];

  for (const issue of issues) {
    reportLines.push(`## Branch: ${issue.branch}`);
    reportLines.push("");
    reportLines.push("```");
    reportLines.push(issue.output.trim());
    reportLines.push("```");
    reportLines.push("");
  }

  const reportPath = "check_bad_characters_report.md";
  writeFileSync(reportPath, reportLines.join("\n"), "utf-8");
  Logger.info(`Report written to ${reportPath}`);

  Logger.error(
    `Bad characters found in ${issues.length} branch(es). See ${reportPath} for details.`,
  );
  process.exit(1);
}

main().catch((err) => {
  Logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
