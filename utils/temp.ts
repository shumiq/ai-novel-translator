import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export function ensureTempDir() {
  if (!existsSync(".temp")) mkdirSync(".temp");
}

export function ensureSkipFile() {
  ensureTempDir();
  if (!existsSync(".temp/skip.txt")) {
    writeFileSync(".temp/skip.txt", "", "utf-8");
  }
}

export function readQueue(): string[] {
  if (!existsSync(".temp/queue.txt")) return [];
  const content = readFileSync(".temp/queue.txt", "utf-8").trim();
  if (!content) return [];
  return content.split("\n");
}

export function getNextFromQueue(): string | null {
  const lines = readQueue();
  return lines[0] || null;
}

export function removeFirstFromQueue() {
  const lines = readQueue();
  lines.shift();
  writeFileSync(".temp/queue.txt", lines.join("\n") + "\n", "utf-8");
}

export function writeQueue(items: string[]) {
  ensureTempDir();
  writeFileSync(
    ".temp/queue.txt",
    items.join("\n") + (items.length > 0 ? "\n" : ""),
    "utf-8",
  );
}
