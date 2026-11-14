# Agent Roles

This project defines 5 agent roles for different use cases. Each role has a dedicated agent definition in `.opencode/agents/`.

---

## Titles and data worktree

Novel data lives in a separate git worktree at `../novel-data` on the `data` branch of this repository. The code repo stays on `main`; there are no per-title branches.

- `web/<slug>/` and `epub/<slug>/` each hold `books/`, `json/`, `novel_data.json`, and `novel_config.json`.
- The active title is `NOVEL_TITLE` (wins) or `.active_title` at the code repo root.
- Leaf tools call `useActiveTitle()` from `utils/title.ts`, which chdirs into the title folder.
- Orchestrators must **not** chdir. Spawn children with `cwd: appRoot` and `NOVEL_TITLE=<id>`.
- Pipeline state lives in `<title>/.temp/`; agent IO lives in `<appRoot>/.temp/`.
- Per-title markers: `.to_be_translated` and `.to_check_bad_character` (gitignored).

---

## 1. api-fallback-handler (`.opencode/agents/api-fallback-handler.md`)

**Purpose:** Acts as a secondary processing layer when primary AI API calls (Gemini) fail, time out, or return unexpected errors.

**When to use:**

- The primary Gemini API is down or returning 500 errors
- A translation/extraction/consistency/humanization request needs to be retried via CLI
- Reading instructions from `.temp/INSTRUCTION.md` and `.temp/PROMPT.md` and writing output to `.temp/output.txt`

**Workflow:**

1. Read `.temp/INSTRUCTION.md` for operational context (written to the code repo's `.temp/`)
2. Read `.temp/PROMPT.md` for the specific prompt
3. Execute with strict output constraints (no filler, no markdown fences, line-count integrity)
4. Write result to `.temp/output.txt`

---

## 2. automation-translate (`.opencode/agents/automation-translate.md`)

**Purpose:** Execute the full translation pipeline as an alternative to running `start.bat` manually.

**When to use:**

- User wants to run the translation pipeline without using the batch file
- Need to translate a batch of chapters from Japanese to Thai
- Need to run specific pipeline steps (prepare, translation passes, finalize)

**Workflow:**

1. Check project configuration (`config.ts`) and the active title
2. Run `bun tools/switch_title.ts [web/slug]` to choose the title
3. Run `bun tools/prepare.ts` to set up directories and convert JSON to HTML
4. Run `bun tools/init_queue.ts` to build a processing queue from non-Thai files
5. Run `bun tools/runner.ts` to execute the 4-pass AI pipeline (extraction → translation → consistency → humanization)
6. Handle retries via `queue.txt` and `skip.txt` for error recovery
7. Run `bun tools/finalize.ts` to convert Thai HTML back to JSON

---

## 3. build-mode (`.opencode/agents/build-mode.md`)

**Purpose:** Modify project code and scripts with full understanding of the codebase architecture.

**When to use:**

- User wants to modify or add TypeScript files
- Need to update configuration (`config.ts`, `opencode.json`)
- Need to create new pipeline instructions or utilities
- Any code maintenance or refactoring task

**Workflow:**

1. Understand the codebase structure and conventions
2. Follow existing patterns for imports, typing, and error handling
3. Run `bun run tsc --noEmit` for type-checking after changes
4. Run `bun run prettier --write .` for formatting
5. Verify changes work with the existing pipeline

---

## 4. japanese-quote-fixer (`.opencode/agents/japanese-quote-fixer.md`)

**Purpose:** Fix unbalanced Japanese quote characters (`「`/`」`/`『`/`』`) in HTML files **before** the translation pipeline runs. This agent is dispatched by `merge_multiline_speech_jp.ts` when the script detects that an author likely made a mistake — e.g., forgot to open/close a quote, used an extra quote, or used a wrong symbol.

**When to use:**

- `merge_multiline_speech_jp.ts` detects files with unbalanced quotes that prevent automatic speech-line merging
- Need to fix Japanese quote formatting in pre-translation HTML files

**Workflow:**

1. `merge_multiline_speech_jp.ts` scans HTML files for multi-line speech patterns
2. If it finds unbalanced quotes that can't be automatically merged, it writes a task list to the code repo's `.temp/INSTRUCTION.md` (with absolute file paths) and dispatches via `opencode run --agent japanese-quote-fixer`
3. The agent reads the instruction file, edits the specified files/line numbers directly, and preserves all HTML structure
4. After the agent finishes, `merge_multiline_speech_jp.ts` retries the merge

---

## 5. leftover-translator (`.opencode/agents/leftover-translator.md`)

**Purpose:** Clean up leftover English or Japanese text in already-translated Thai HTML files after the main pipeline completes.

**When to use:**

- After the 4-pass pipeline finishes, some English or Japanese lines remain untranslated
- Need to scan translated HTML files for non-Thai text and translate it to Thai
- A dedicated cleanup pass via `translate_leftover.ts`

**Workflow:**

1. Run `bun tools/translate_leftover.ts` to detect and translate leftover non-Thai lines (auto-detects language from `novelConfig.originalLanguage`)
2. The script scans translated HTML files, identifies non-Thai lines, writes a task list to the code repo's `.temp/INSTRUCTION.md` (with absolute file paths), and dispatches the work via `opencode run --agent leftover-translator`
3. The agent reads the instruction file, edits the specified files/line numbers directly, and preserves all HTML structure

---

## Agent Selection

The top-level agent (this file) should:

- Parse the user's request to determine which agent role is needed
- If the request involves AI API calls that may fail → delegate to `api-fallback-handler`
- If the request involves running the translation pipeline → delegate to `automation-translate`
- If the request involves modifying code/scripts → delegate to `build-mode`
- If the request involves cleaning up leftover English/Japanese text in translated HTML files → delegate to `leftover-translator`
- If the request involves fixing unbalanced Japanese quotes in HTML files (`「`/`」`/`『`/`』`) → delegate to `japanese-quote-fixer`
- If unsure, ask the user which role they need

---

# Build-mode Agent Instructions

## Runtime and toolchain

- **Runtime:** Bun (not Node). Scripts are plain `.ts` files executed with `bun <file>.ts`.
- **Module system:** ES modules (`"type": "module"` in package.json). Never use `require()`.
- **TypeScript:** ESNext target, `"module": "Preserve"`, `"moduleResolution": "bundler"`. Strict mode enabled.
- **Formatter:** Prettier. Run `bun run prettier --write .` (alias: `bun run format`).
- **Type-check:** `bun run tsc --noEmit` (alias: `bun run typecheck`). No build step — `"noEmit": true`.

## Post-change checklist

1. `bun run tsc --noEmit` — must pass with zero errors
2. `bun run prettier --write .` — must be run after every edit
3. For pipeline logic changes: `bun tools/prepare.ts && bun tools/init_queue.ts && bun tools/runner.ts` to verify end-to-end

## Project architecture

### Pipeline (4-pass, orchestrated by `runner_api.ts`)

1. **Extraction** (`instructions/1_extraction.ts`) — AI extracts character names, locations, terminology into `novel_data.json` (the shared dictionary).
2. **Translation** (`instructions/2_translation.ts`) — Japanese/English → Thai translation using the dictionary.
3. **Consistency** (`instructions/3_consistency.ts`) — Fixes dictionary mismatches across translated text.
4. **Humanization** (`instructions/4_humanization.ts`) — Polishes Thai output for naturalness.

Entry points: `bun tools/switch_title.ts` → `bun tools/prepare.ts` → `bun tools/init_queue.ts` → `bun tools/runner.ts` → `bun tools/finalize.ts` (or `start.bat` for the full loop).

### Titles and data worktree

- Data lives in the `../novel-data` worktree (branch `data`), never on `main`.
- `config.ts` loads `novelConfig` from `../novel-data/<NOVEL_TITLE or .active_title>/novel_config.json` and resolves its paths against the code repo root.
- `utils/title.ts` owns `listTitles()`, `titleDir()`, `useActiveTitle()`, and `forEachTitle()`.
- Leaf tools call `useActiveTitle()` at startup; orchestrators spawn children with `cwd: appRoot` and `NOVEL_TITLE`.
- Git commands that touch title data run with `cwd` set to the title folder (or `git -C`), so they only stage that title.

### File formats

- **HTML files** in `books/` use `<p>line</p>` markup, one line per `<p>` tag. **1:1 line correspondence between input and output is enforced** — validation will fail and restart the pipeline if line counts mismatch.
- **Dictionary** (`novel_data.json`): JSON object keyed by lowercase Japanese term. Each entry has `translations` (Thai array), `description`, and optionally `gender`, `base_style`, `negative_constraints`, `example`.

### Temp directories

Two separate temp directories:

- `<title>/.temp/` — pipeline state: `queue.txt`, `skip.txt`, `humanized.txt`, `novel_files.json`, per-file intermediates, API key sentinels.
- `<appRoot>/.temp/` — agent IO: `INSTRUCTION.md`, `PROMPT.md`, `output.txt`.

Both are gitignored. Never use `.temp` for cross-step state; use the title markers.

### API and AI calls

- All AI requests go through `utils/ai.ts`, which dispatches to `utils/gemini.ts` (Gemini API), `utils/openrouter.ts` (OpenRouter API), or `utils/opencode.ts` (OpenCode CLI) based on `appConfig.provider`.
- Error classes (`ProhibitedContentError`, `HighDemandError`) are defined in `utils/errors.ts`.
- API keys come from `.env` via `GEMINI_API_KEY` (comma-separated for rotation) and `OPENROUTER_API_KEY` (comma-separated for rotation).
- On 429: current key is marked used (sentinel file in `.temp/`), retries with next key.
- On 503: retries up to 5 times with backoff (honoring `Retry-After` header for OpenRouter), then falls back to OpenCode.
- On PROHIBITED_CONTENT: either throws `ProhibitedContentError` (skips file) or falls back to OpenCode.
- OpenCode fallback invokes `opencode run` with the `api-fallback-handler` agent.

### Key conventions

- **Imports:** Use relative paths (`../utils/gemini`). The `@utils/*` path alias exists in tsconfig but codebase uses relative imports.
- **Error handling:** Typed errors from `utils/errors.ts` (`ProhibitedContentError`, `HighDemandError`). Pipeline catches and skips on errors.
- **Logging:** Use `utils/logger.ts` — `Logger.info()`, `Logger.warn()`, `Logger.error()`, `Logger.debug()` (debug gated by `appConfig.debug`).
- **Validation:** `utils/validate.ts` checks line count, Thai detection, bracket/parenthesis matching, and starting character type. Controlled by `appConfig.validation` flags.
- **Sanitization:** `utils/sanitize.ts` strips HTML to `<p>` lines, normalizes Japanese punctuation (quotes → `"`, brackets → `[...]`, fullwidth digits → ASCII, Thai digits → ASCII, etc.).
- **Git auto-commit:** `runner_api.ts` runs `git add` on successfully translated files. Dictionary changes are also auto-staged.

### Configuration (`config.ts`)

- `novelConfig` — Loaded at import time from the active title's `novel_config.json`; paths are resolved to absolute paths against `appRoot`.
- `appConfig` — Runtime settings: provider (`gemini`/`openrouter`/`opencode`), models, `novelDataPath`, pipeline steps, validation flags, chunk sizes, debug toggle.
- `appRoot` / `novelDataRoot` — Absolute code repo root and data worktree root (resolved once, so a later `chdir` cannot change them).

### Important gotchas

- `start.bat` loops: if `runner.ts` exits non-zero (files remaining in queue/skip), it re-runs the entire pipeline. The loop limit is 10 files per `runner.ts` invocation.
- `isThai()` in `utils/lang.ts` is not a simple script check — it also counts Japanese character density to avoid false positives on mixed-script content.
- `extractLinesFromHtml()` (in `utils/text.ts`) is the canonical way to get content lines from HTML. Don't parse `<p>` tags manually.
- New instruction steps follow the naming convention `N_name.ts` in `instructions/` (currently 0–4, 99).
- Books can be flat (`books/001.html`) or EPUB-organized (`books/<epub>/OEBPS/001.xhtml`). Sorting uses `content.opf` order for EPUB files.
