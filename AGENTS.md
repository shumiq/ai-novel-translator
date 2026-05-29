# Agent Roles

This project defines 4 agent roles for different use cases. Each role has a dedicated agent definition in `.opencode/agents/`.

---

## 1. api-fallback-handler (`.opencode/agents/api-fallback-handler.md`)

**Purpose:** Acts as a secondary processing layer when primary AI API calls (Gemini) fail, time out, or return unexpected errors.

**When to use:**

- The primary Gemini API is down or returning 500 errors
- A translation/extraction/consistency/humanization request needs to be retried via CLI
- Reading instructions from `.temp/INSTRUCTION.md` and `.temp/PROMPT.md` and writing output to `.temp/output.txt`

**Workflow:**

1. Read `.temp/INSTRUCTION.md` for operational context
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

1. Check project configuration (`config.ts`)
2. Run `bun prepare.ts` to set up directories and convert JSON to HTML
3. Run `bun runner.ts` to execute the 4-pass AI pipeline (extraction → translation → consistency → humanization)
4. Handle retries and `skip.txt` for error recovery
5. Run `bun finalize.ts` to convert Thai HTML back to JSON

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
2. If it finds unbalanced quotes that can't be automatically merged, it writes a task list to `.temp/INSTRUCTION.md` and dispatches via `opencode run --agent japanese-quote-fixer`
3. The agent reads the instruction file, edits the specified files/line numbers directly, and preserves all HTML structure
4. After the agent finishes, `merge_multiline_speech_jp.ts` retries the merge

---

## 5. leftover-translator (`.opencode/agents/leftover-translator.md`)

**Purpose:** Clean up leftover English or Japanese text in already-translated Thai HTML files after the main pipeline completes.

**When to use:**

- After the 4-pass pipeline finishes, some English or Japanese lines remain untranslated
- Need to scan translated HTML files for non-Thai text and translate it to Thai
- A dedicated cleanup pass for `translate_leftover_english.ts` or `translate_leftover_japanese.ts`

**Workflow:**

1. Run `bun translate_leftover_english.ts` or `bun translate_leftover_japanese.ts` to detect and translate leftover non-Thai lines
2. Each script scans translated HTML files, identifies non-Thai lines, writes a task list to `.temp/INSTRUCTION.md`, and dispatches the work via `opencode run --agent leftover-translator`
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
