# AGENTS.md

Japanese/English → Thai novel translator. TypeScript run with **Bun** (no build step, `noEmit: true`). No test suite — verification is running the pipeline.

## Commands

```bash
bun install
bun run typecheck          # bun run tsc --noEmit  (must be clean)
bun run format             # bun run prettier --write .  (run after every edit)
bun run tools              # list every tool with its name + description
bun run start              # loop prepare → init_queue → runner until the queue drains, then finalize
```

Full flow (each step exits non-zero while files remain in `queue.txt` / `skip.txt`):

```bash
bun tools/switch_title.ts web/<slug>   # or epub/<slug>; writes .active_title, prompts to create a title
bun tools/prepare.ts                   # JSON -> books/*.html
bun tools/init_queue.ts                # queue from non-Thai files (Thai files when extraction+translation are off)
bun tools/runner.ts                    # 4-pass pipeline, max 10 files per invocation
bun tools/finalize.ts                  # Thai HTML -> json/*.json (+ copies to outputPath)
```

Do not run `bun tools/runner.ts` as a smoke test — it makes paid AI calls and edits the novel data. Never assume `../novel-data` is empty: the pipeline **stages** changes there (`git add`) and only commits when you or a tool does.

## Titles and the data worktree

- All novel data lives in the `../novel-data` worktree, branch `data`. The code repo stays on `main`; there are **no per-title branches** (the `*_branch` tool names are historical — they operate on the whole data worktree).
- Each title is `web/<slug>/` or `epub/<slug>/` holding `books/`, `json/`, `novel_data.json` (the dictionary), and `novel_config.json` (which points at `originalPath` / `outputPath` / `dictionaryPath`).
- The active title is `NOVEL_TITLE` (wins) or `.active_title` at the code repo root.
- `utils/title.ts` owns `listTitles()`, `titleDir()`, `useActiveTitle()`, `forEachTitle()`. **Leaf tools call `useActiveTitle()`, which `process.chdir()`es into the title folder.** Orchestrators must not chdir: spawn children with `cwd: appRoot` and `NOVEL_TITLE=<id>`.
- `novel_config.json` paths are stored relative to the **code repo root**; `config.ts` resolves them against `appRoot` at import time.
- Git commands touching title data run with `cwd` in the title folder (or `git -C`), so only that title is staged.
- Per-title markers (gitignored, never committed): `.to_be_translated` (needs a run of `translate_new_chapters.ts`), `.to_check_bad_character` (needs `check_bad_characters_all_branch.ts`).
- `../novel-data` must be on `data`; `squash_data_branch.ts` refuses otherwise. The data branch is intentionally squashed into one commit — squash, don't rebase.

## Pipeline

`runner_api.ts` orchestrates four passes; each pass writes a temp artifact and is skipped if that artifact already exists, so a crashed run resumes per-file.

| Pass         | File                             | Reads                                | Writes                                       |
| ------------ | -------------------------------- | ------------------------------------ | -------------------------------------------- |
| extraction   | `instructions/1_extraction.ts`   | `books/<file>.html`                  | `novel_data.json`, `.temp/extraction_<file>` |
| translation  | `instructions/2_translation.ts`  | original HTML                        | `.temp/translated_<file>`                    |
| consistency  | `instructions/3_consistency.ts`  | original + `.temp/translated_<file>` | `.temp/consistency_checked_<file>`           |
| humanization | `instructions/4_humanization.ts` | `.temp/consistency_checked_<file>`   | `.temp/final_humanized_<file>`               |

- `appConfig.pipeline` controls which passes run. With `extraction`/`translation` off, the queue is built from Thai files and `extractExistedWords(..., { searchByThai: true, genderOnly: true })` is used instead.
- On success the runner copies the final artifact over `books/<file>.html`, deletes the temp artifacts, appends to `.temp/humanized.txt`, and `git add`s the file.
- Non-zero exit (files still in `queue.txt`/`skip.txt`) is the retry signal; `bun run start` loops the whole flow on it. `appConfig.loopSkip` wipes `skip.txt` at the 10-file limit.

## Hard constraints

- **1:1 line correspondence is enforced.** One `<p>` per line, same count in and out. `utils/validate.ts` fails the chunk otherwise; the pass retries from `failLine - 10`, and with `validation.retriesLimit` reached the file goes to `skip.txt`. Never merge, drop, or summarize lines.
- `utils/text.ts` is the canonical HTML reader (`extractLinesFromHtml`, `extractTitleFromHtml`, `countLines` via `utils/count_line.ts`). Don't parse `<p>` with regex or JSDOM in new code — `utils/sanitize.ts` still uses JSDOM, that's legacy.
- `utils/lang.ts` `isThai()` is not a script check: it also counts Japanese/Latin density to avoid false positives on mixed content.
- Books are flat (`books/001.html`) or EPUB (`books/<epub>/OEBPS/001.xhtml`); EPUB order comes from `content.opf`, web order from the digits in the filename.
- New instruction steps: `N_name.ts` in `instructions/` (currently 0–4, 99).

## Config (`config.ts`)

- `appConfig` — provider (`gemini` | `openrouter` | `opencode`), per-provider models, chunk sizes, pipeline passes, validation flags, debug. Change behaviour here, not in the instruction files.
- `novelConfig` — loaded at import time from the active title's `novel_config.json`.
- `appRoot` / `novelDataRoot` — resolved once, so a later `chdir` cannot change them. Use these instead of `process.cwd()`.

## AI calls

- All requests go through `utils/ai.ts` → `gemini.ts` / `openrouter.ts` / `opencode.ts`.
- API keys come from `.env` (Bun loads it): `GEMINI_API_KEY` and `OPENROUTER_API_KEY`, comma-separated for rotation. Keys are rotated by a **sentinel file named after the key** in `<title>/.temp/`; those files expire after 1 hour. Never hardcode or log keys.
- 429 → mark the current key used, wait 5s, next key. 503 → retry up to 5× with backoff (OpenRouter honors `Retry-After`). `PROHIBITED_CONTENT` → `ProhibitedContentError` when `skipProhibitedContent`, otherwise OpenCode fallback.
- OpenCode fallback writes `<appRoot>/.temp/{INSTRUCTION,PROMPT}.md`, runs `opencode run --agent api-fallback-handler`, and reads `.temp/output.txt`.

## Temp directories

- `<title>/.temp/` — pipeline state: `queue.txt`, `skip.txt`, `humanized.txt`, `novel_files.json` (cache; `init_queue.ts` refreshes with `force: true`), per-file intermediates, key sentinels.
- `<appRoot>/.temp/` — agent IO (`INSTRUCTION.md`, `PROMPT.md`, `output.txt`) and the `opencode.json` instruction files. It does not exist until something writes to it.
- Both are gitignored. Never use `.temp` for cross-step state — use the title markers.
- `bun tools/clear_all_temp.ts [--dry-run]` deletes all of them.

## Data and git

- The pipeline stages (`git add`) but never commits. Review with `git -C ../novel-data diff --cached`; commit manually, or `bun tools/squash_data_branch.ts` (add `--committed-only` to refuse a dirty tree).
- `bun tools/sanitize_all_branch.ts` sanitizes + finalizes every title and leaves changes staged and uncommitted.
- `bun tools/update_branches.ts` pulls new chapters into each title and marks it `.to_be_translated`; `bun tools/translate_new_chapters.ts` runs the full pipeline for marked titles (Japanese titles get `merge_multiline_speech_jp.ts` first) and marks them `.to_check_bad_character` on success.
- `finalize.ts` copies the dictionary to `novelConfig.dictionaryPath` and, when `autoPushDictionasry` is on, `git add . && git commit --amend && git push -f` in that directory. That force-push is expected, but know it happens.

## Conventions

- Relative imports (`../utils/gemini`); the `@utils/*` tsconfig alias exists but is barely used.
- Typed errors from `utils/errors.ts`; pipeline catches and skips on them.
- Logging via `utils/logger.ts` (`Logger.debug/info/warn/error/progress/done/step`); `debug` is gated by `appConfig.debug`.
- Tools are plain scripts with a `// Name:` / `// Description:` header (optionally `// Usage:`) — `tools.ts` parses those two lines to build its listing.

## Subagents

`.opencode/agents/` holds the dispatchable roles: `api-fallback-handler` (writes `.temp/output.txt` from `PROMPT.md`), `automation-translate`, `build-mode` (default), `bad-character-fixer`, `japanese-quote-fixer`, `leftover-translator`. `merge_multiline_speech_jp.ts`, `translate_leftover.ts`, and `fix_bad_characters.ts` dispatch to them by writing a task list to `<appRoot>/.temp/INSTRUCTION.md` with absolute file paths and then editing those files directly.
