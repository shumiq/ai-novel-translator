# ai-novel-translator

Japanese/English → Thai novel translator. TypeScript run directly with [Bun](https://bun.sh) — no build step.

Novel data (chapters, dictionaries, config) lives in a separate git worktree at `../novel-data` on the `data` branch. This repo holds only the code.

## Requirements

- [Bun](https://bun.sh) (`bun install` installs the rest)
- A sibling `../novel-data` checkout on the `data` branch
- At least one AI provider key in `.env`:

```bash
GEMINI_API_KEY=key1,key2        # comma-separated for rotation
OPENROUTER_API_KEY=key          # optional
```

Keys are rotated by sentinel files in `<title>/.temp/` and expire after an hour. Never commit `.env`.

## Setup

```bash
bun install
bun run typecheck      # bun run tsc --noEmit — must be clean
```

## Quick start

```bash
bun tools/switch_title.ts web/<slug>    # pick an existing title, or create a new one
bun tools/prepare.ts                    # JSON source -> books/*.html
bun tools/init_queue.ts                 # build the processing queue from non-Thai files
bun tools/runner.ts                     # 4-pass AI pipeline (max 10 files per run)
bun tools/finalize.ts                   # Thai HTML -> json/*.json
```

`bun run start` loops `prepare → init_queue → runner` until the queue drains, then finalizes. This makes **paid AI calls** and edits the novel data — don't run it as a smoke test.

Each step exits non-zero while files remain in `queue.txt` / `skip.txt`; that non-zero exit is the "keep going" signal for `bun run start`.

## How the pipeline works

`runner.ts` / `runner_api.ts` run four passes. Each pass writes a temp artifact and is skipped when that artifact already exists, so an interrupted run resumes per file.

| Pass         | Implementation                   | Reads                                | Writes                                      |
| ------------ | -------------------------------- | ------------------------------------ | ------------------------------------------- |
| extraction   | `instructions/1_extraction.ts`   | `books/<file>.html`                  | `dictionaryPath`, `.temp/extraction_<file>` |
| translation  | `instructions/2_translation.ts`  | original HTML                        | `.temp/translated_<file>`                   |
| consistency  | `instructions/3_consistency.ts`  | original + `.temp/translated_<file>` | `.temp/consistency_checked_<file>`          |
| humanization | `instructions/4_humanization.ts` | `.temp/consistency_checked_<file>`   | `.temp/final_humanized_<file>`              |

On success the final artifact is copied over `books/<file>.html`, temp artifacts are deleted, the file is appended to `.temp/humanized.txt`, and `git add`ed.

**1:1 line correspondence is enforced.** One `<p>` per line, same count in and out. `utils/validate.ts` fails a chunk otherwise; the pass retries and eventually moves the file to `skip.txt`. Never merge, drop, or summarize lines.

## Titles and the data worktree

- Each title is `web/<slug>/` or `epub/<slug>/` inside `../novel-data`, holding `books/`, `json/`, and `novel_config.json` (which points at `originalPath` / `outputPath` / `dictionaryPath`).
- The active title is `NOVEL_TITLE` (wins) or `.active_title` at the repo root. `bun tools/switch_title.ts <id>` writes it.
- Per-title markers (gitignored, never committed): `.to_be_translated`, `.to_check_bad_character`.
- There are no per-title git branches. Tools named `*_branch` operate on the whole data worktree; `squash_data_branch.ts` squashes `data` into one commit.
- The pipeline **stages** (`git add`) but never commits. Review with `git -C ../novel-data diff --cached`.

## Configuration

All behaviour lives in `config.ts`:

- `appConfig` — provider (`gemini` | `openrouter` | `opencode`), per-provider models, `chunkSize`, `pipeline` passes, `validation` flags, `debug`.
- `novelConfig` — loaded at import time from the active title's `novel_config.json`.

Change behaviour here, not in the instruction files.

## Project layout

```
config.ts          appConfig + active-title config loading
instructions/      pipeline steps 0-4, 99 (N_name.ts convention)
tools/             scripts, run with `bun tools/<name>.ts`
utils/             ai/gemini/openrouter/opencode, validate, lang, logger, title, text, ...
.opencode/agents/  dispatchable roles (api-fallback-handler, bad-character-fixer, ...)
```

List every tool with its description:

```bash
bun run tools
```

Common ones:

| Tool                              | Purpose                                                             |
| --------------------------------- | ------------------------------------------------------------------- |
| `switch_title`                    | Select/create the active title                                      |
| `prepare`                         | Set up directories, convert JSON to HTML                            |
| `init_queue`                      | Build the queue from non-Thai files                                 |
| `runner`                          | 4-pass pipeline (10 files per invocation)                           |
| `finalize`                        | Thai HTML → JSON (+ copy to `outputPath`)                           |
| `update_branches`                 | Fetch new chapters into the data worktree, mark `.to_be_translated` |
| `translate_new_chapters`          | Run the full pipeline for marked titles                             |
| `check_bad_characters_all_branch` | Check titles marked `.to_check_bad_character`                       |
| `sanitize_all_branch`             | Sanitize + finalize every title (leaves changes staged)             |
| `translate_leftover`              | Translate leftover English/Japanese lines to Thai                   |
| `squash_data_branch`              | Squash the data branch into one commit                              |
| `clear_all_temp`                  | Delete every `.temp` directory (`--dry-run` to preview)             |

## Temp directories

- `<title>/.temp/` — pipeline state: `queue.txt`, `skip.txt`, `humanized.txt`, `novel_files.json`, per-file intermediates, key sentinels.
- `<appRoot>/.temp/` — agent IO (`INSTRUCTION.md`, `PROMPT.md`, `output.txt`). Created on demand.

Both are gitignored. Don't use `.temp` for cross-step state — use the title markers.

## Conventions

- ES module imports (`import ... from "./utils/x"`), TypeScript, `noEmit: true`.
- Typed errors from `utils/errors.ts` (`ProhibitedContentError`, `HighDemandError`); the pipeline catches and skips on them.
- Logging via `utils/logger.ts` (debug is gated by `appConfig.debug`).
- Canonical HTML reading in `utils/text.ts` (`extractLinesFromHtml`, `countLines`) — don't parse `<p>` with regex or JSDOM in new code.
- Tools are plain scripts with a `// Name:` / `// Description:` header (optionally `// Usage:`); `tools.ts` parses those lines for the listing.
- Run `bun run format` after every edit.

## Troubleshooting

- **Files keep going to `skip.txt`** — validation failed (line count / Thai / quotes / brackets). Check `.temp/skip.txt`, then re-run with `appConfig.validation` flags adjusted or `appConfig.loopSkip` to wipe the skip list.
- **429 / 503 from the AI provider** — add more keys (comma-separated), the code rotates them and backs off automatically.
- **Wrong title processed** — check `.active_title` and `NOVEL_TITLE`; `NOVEL_TITLE` wins.
- **Stale state** — `bun tools/clear_all_temp.ts`, then `init_queue` again.
