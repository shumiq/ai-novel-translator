import { existsSync, readdirSync } from "fs";
import { isAbsolute, join, relative, resolve } from "path";
import {
  appRoot,
  getActiveTitleId,
  novelDataRoot,
  TITLE_ID_RE,
} from "../config";

const TYPES = ["web", "epub"] as const;

/**
 * Render a path relative to the code repo root so terminals can open it when
 * tools are launched from the repo root (tools chdir into the title folder).
 */
export function displayPath(file: string): string {
  const absolute = isAbsolute(file) ? file : resolve(process.cwd(), file);
  return relative(appRoot, absolute) || absolute;
}

export function listTitles(): string[] {
  const titles: string[] = [];
  for (const type of TYPES) {
    const dir = join(novelDataRoot, type);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (existsSync(join(dir, name, "novel_config.json"))) {
        titles.push(`${type}/${name}`);
      }
    }
  }
  return titles.sort();
}

export function titleDir(id: string): string {
  if (id.split("/").length !== 2 || !TITLE_ID_RE.test(id)) {
    throw new Error(`Invalid title id: ${JSON.stringify(id)}`);
  }
  const [type, slug] = id.split("/") as [string, string];
  return join(novelDataRoot, type, slug);
}

export function useActiveTitle(): string {
  const id = getActiveTitleId();
  if (!id) {
    throw new Error(
      "No active title. Set NOVEL_TITLE or run `bun tools/switch_title.ts`.",
    );
  }

  const dir = titleDir(id);
  const configPath = join(dir, "novel_config.json");
  if (!existsSync(configPath)) {
    throw new Error(`Title not found: ${id} (missing ${configPath})`);
  }

  process.chdir(dir);
  return id;
}

export async function forEachTitle(
  fn: (id: string, dir: string) => void | Promise<void>,
): Promise<void> {
  for (const id of listTitles()) {
    await fn(id, titleDir(id));
  }
}
