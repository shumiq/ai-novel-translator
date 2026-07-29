// Name: Tools List
// Description: List all available tools with their name and description

import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(toolsDir)
  .filter((f) => f.endsWith(".ts") && f !== "tools.ts")
  .sort();

interface ToolInfo {
  name: string;
  description: string;
  file: string;
}

const tools: ToolInfo[] = [];

for (const file of files) {
  const content = readFileSync(join(toolsDir, file), "utf-8");
  const lines = content.split("\n");
  const nameLine = lines[0]?.trim();
  const descLine = lines[1]?.trim();
  const name = nameLine?.startsWith("// Name:") ? nameLine.slice(8).trim() : "";
  const description = descLine?.startsWith("// Description:")
    ? descLine.slice(15).trim()
    : "";
  tools.push({ name, description, file });
}

console.log("\n  Available tools:\n");
for (const t of tools) {
  const fileLabel = t.file.replace(/\.ts$/, "");
  console.log(`    ${fileLabel.padEnd(30)} ${t.name}`);
  if (t.description) {
    console.log(`    ${"".padEnd(30)} ${t.description}`);
  }
  console.log();
}
console.log(`  ${tools.length} tools total. Run with: bun tools/<name>.ts\n`);
