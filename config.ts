import { existsSync, readFileSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import type { NovelConfig } from "./utils/types";

export const appRoot = dirname(fileURLToPath(import.meta.url));

export const appConfig = {
  provider: "gemini",
  model: {
    gemini: "gemini-flash-lite-latest",
    opencode: "console-gemini-proxy/gemini-flash-lite-latest#high",
    openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free",
  },
  geminiAPIKeys: process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.split(",")
    : [],
  openrouterAPIKeys: process.env.OPENROUTER_API_KEY
    ? process.env.OPENROUTER_API_KEY.split(",")
    : [],
  novelDataPath: "../novel-data",
  pipeline: ["extraction", "translation", "consistency", "humanization"],
  skipProhibitedContent: false,
  skipHighDemand: false,
  loopSkip: true,
  previousChunk: 30,
  chunkSize: 100,
  thinking: "high",
  autoPushDictionasry: true,
  epub_seprarator: ["*", "※", "◇"],
  validation: {
    retriesLimit: 0,
    lineCount: true,
    isThai: true,
    quoteCount: true,
    parenthesesCount: true,
    startCharacter: false,
    badCharacter: false,
  },
  debug: false,
};

export const novelDataRoot = resolve(appRoot, appConfig.novelDataPath);

export const TITLE_ID_RE = /^(web|epub)\/[a-z0-9_-]+$/;

const DEFAULT_NOVEL_CONFIG: NovelConfig = {
  originalPath: "",
  outputPath: "",
  dictionaryPath: "",
  title: "",
  originalLanguage: "Japanese",
  additionalContext: [],
};

export function getActiveTitleId(): string {
  const env = process.env.NOVEL_TITLE?.trim();
  if (env) return env;
  const marker = join(appRoot, ".active_title");
  if (!existsSync(marker)) return "";
  return readFileSync(marker, "utf-8").trim();
}

// Paths in novel_config.json are stored relative to the code repo root so the
// data stays portable; resolve them once while we are still at appRoot.
function fromAppRoot(value: string): string {
  if (!value) return "";
  return isAbsolute(value) ? value : resolve(appRoot, value);
}

function loadNovelConfig(): NovelConfig {
  const id = getActiveTitleId();
  if (!id || !TITLE_ID_RE.test(id)) return { ...DEFAULT_NOVEL_CONFIG };

  const configPath = join(novelDataRoot, id, "novel_config.json");
  if (!existsSync(configPath)) return { ...DEFAULT_NOVEL_CONFIG };

  const raw = JSON.parse(
    readFileSync(configPath, "utf-8"),
  ) as Partial<NovelConfig>;
  return {
    originalPath: fromAppRoot(raw.originalPath ?? ""),
    outputPath: fromAppRoot(raw.outputPath ?? ""),
    dictionaryPath: fromAppRoot(raw.dictionaryPath ?? ""),
    title: raw.title ?? "",
    originalLanguage: raw.originalLanguage ?? "Japanese",
    additionalContext: raw.additionalContext ?? [],
  };
}

export const novelConfig: NovelConfig = loadNovelConfig();
