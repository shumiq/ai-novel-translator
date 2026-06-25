import { cpSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { cp, readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { novelConfig } from "../config";
import { Logger } from "../utils/logger";
import { extractLinesFromHtml } from "../utils/text";

export async function preparation() {
  Logger.step("📦", "Preparation");

  // ── #1. ensure directories and files ──────────────────────────────
  {
    if (novelConfig.outputPath && !existsSync(novelConfig.outputPath)) {
      mkdirSync(novelConfig.outputPath, { recursive: true });
    }
    if (!existsSync("./json")) mkdirSync("./json");
    if (!existsSync("./books")) mkdirSync("./books");
    if (!existsSync("./novel_data.json")) {
      if (
        novelConfig.dictionaryPath &&
        existsSync(novelConfig.dictionaryPath)
      ) {
        cpSync(novelConfig.dictionaryPath, "./novel_data.json");
        Logger.info(`Copied: ${novelConfig.dictionaryPath} to novel_data.json`);
      } else {
        Logger.warn(
          `The dictionary file ${novelConfig.dictionaryPath} does not exist. A new novel_data.json file will be created.`,
        );
        writeFileSync("./novel_data.json", "{}");
      }
    }
    if (!existsSync("./.temp")) mkdirSync("./.temp");
    if (!existsSync("./.temp/skip.txt")) writeFileSync("./.temp/skip.txt", "");
    if (!existsSync("./.temp/queue.txt"))
      writeFileSync("./.temp/queue.txt", "");
  }

  // ── #2+#3. copy JSON from outputPath (priority) and originalPath (fallback) ──
  Logger.info("Copy JSON from sources");

  const copies: { src: string; dest: string }[] = [];
  let originalMeta: {
    id: string;
    title: string;
    chapters: { ch: number; name: string }[];
  } | null = null;

  // outputPath – first priority
  if (novelConfig.outputPath && existsSync(novelConfig.outputPath)) {
    const files = await readdir(novelConfig.outputPath);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const dest = join("./json", file);
      if (!existsSync(dest)) {
        copies.push({ src: join(novelConfig.outputPath, file), dest });
      }
    }
  }

  // originalPath – fallback for files missing in outputPath and not yet in json/
  if (novelConfig.originalPath && existsSync(novelConfig.originalPath)) {
    // Build a set of files that are already in outputPath (so we skip them)
    const alreadyCovered = new Set(
      novelConfig.outputPath && existsSync(novelConfig.outputPath)
        ? (await readdir(novelConfig.outputPath)).filter((f) =>
            f.endsWith(".json"),
          )
        : [],
    );
    const allFiles = await readdir(novelConfig.originalPath);
    for (const file of allFiles.filter((f) => f.endsWith(".json"))) {
      if (alreadyCovered.has(file)) continue;
      const dest = join("./json", file);
      if (!existsSync(dest)) {
        copies.push({ src: join(novelConfig.originalPath, file), dest });
      }
      // Track meta.json from originalPath for chapter merging
      if (file === "meta.json") {
        const raw = await readFile(
          join(novelConfig.originalPath, file),
          "utf-8",
        );
        originalMeta = JSON.parse(raw) as {
          id: string;
          title: string;
          chapters: { ch: number; name: string }[];
        };
      }
    }
  }

  // Execute all copies in parallel
  if (copies.length > 0) {
    await Promise.all(
      copies.map(async ({ src, dest }) => {
        await cp(src, dest);
        Logger.progress(`Copied: ${dest}`);
      }),
    );
  }

  // Merge chapters from originalPath meta.json into local meta.json
  if (originalMeta && existsSync("./json/meta.json")) {
    const localMetaRaw = await readFile("./json/meta.json", "utf-8");
    const localMeta = JSON.parse(localMetaRaw) as {
      id: string;
      title: string;
      chapters: { ch: number; name: string }[];
    };
    for (const chapter of originalMeta.chapters) {
      if (!localMeta.chapters.some((c) => c.ch === chapter.ch)) {
        localMeta.chapters.push(chapter);
      }
    }
    await writeFile("./json/meta.json", JSON.stringify(localMeta, null, 2));
  }

  // ── #4. convert all json to html ─────────────────────────────────
  Logger.info("Convert JSON to HTML");

  // Read meta.json once and reuse for title lookups
  const metaExists = existsSync("./json/meta.json");
  const meta = metaExists
    ? (JSON.parse(await readFile("./json/meta.json", "utf-8")) as {
        id: string;
        title: string;
        chapters: { ch: number; name: string }[];
      })
    : null;

  const jsonFiles = await readdir("./json");
  const toConvert = jsonFiles
    .filter((f) => f.endsWith(".json") && f !== "meta.json")
    .filter((f) => !existsSync(`./books/${f.replace(".json", ".html")}`));

  if (toConvert.length > 0) {
    await Promise.all(
      toConvert.map(async (file) => {
        Logger.progress(`Converting ${file} to HTML...`);
        const raw = await readFile(`./json/${file}`, "utf-8");
        const data = JSON.parse(raw) as { title: string; content: string };

        // Extract <p> text without JSDOM – the content is always
        // simple <p>...</p> markup (see utils/sanitize.ts for reference).
        const lines = extractLinesFromHtml(data.content);

        const ch = Number(file.split(".")[0]);
        const title =
          data.title ||
          meta?.chapters.find((c) => c.ch === ch)?.name ||
          `ตอนที่ ${ch}`;

        const html = [title, ...lines]
          .map((line) => `<p>${line.trim()}</p>`)
          .join("\n");

        await writeFile(`./books/${file.replace(".json", ".html")}`, html);
      }),
    );
  }

  Logger.done("Preparation complete");
}
