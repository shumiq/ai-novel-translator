# Plan: Flexible Pipeline for Thai-Input Scenarios (draft.md #4 and #5)

## Goal

Support running the pipeline starting from **already-translated Thai files** (scenarios #4 and #5 from `draft.md`):

- `consistency => humanization` (fix gender/pronouns in existing Thai translation)
- `humanization` only (polish Thai prose)

---

## Current Blockers

| #   | Issue                                                                            | Location                                            |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Queue always built from non-Thai files                                           | `init_queue.ts:11` calls `extractNonThai()`         |
| 2   | No persistent tracking of humanized files — queue rebuilds from scratch each run | `init_queue.ts:10` (`getAllFiles({ force: true })`) |
| 3   | `extractExistedWords` only searches by original-language key                     | `utils/dictionary.ts:10-19`                         |
| 4   | `extractExistedWords` has no gender-only filter                                  | `utils/dictionary.ts:10`                            |
| 5   | Consistency/humanization read `file` as "original" — but it's Thai               | `3_consistency.ts:29`, `4_humanization.ts:33`       |
| 6   | Catch block doesn't clean up temp files — orphaned files accumulate in `.temp/`  | `runner_api.ts:112-116`                             |
| 7   | `extractThai()` doesn't sort — queue order would be wrong                        | `utils/extract.ts:66-72`                            |

---

## Changes

### 1. Auto-detect queue source from pipeline (`init_queue.ts`)

No config change needed. Derive from the pipeline itself:

```ts
const needsOriginalText =
  appConfig.pipeline.includes("extraction") ||
  appConfig.pipeline.includes("translation");
const files = needsOriginalText ? extractNonThai() : extractThai();
```

- Pipeline includes extraction/translation → input is non-Thai → queue non-Thai files
- Pipeline is only consistency/humanization → input is already Thai → queue Thai files

`extractThai()` already exists in `utils/extract.ts:66-72` (now includes `.sort(chapterSortFn)`).

### 2. Track humanized files (`runner_api.ts` + `init_queue.ts`)

Use a persistent marker file `.temp/humanized.txt` to track files that have been successfully humanized. This survives across runs since the queue is rebuilt from scratch each time.

**In `runner_api.ts`**: After the isThai check passes (line 76), append the file to `humanized.txt`:

```ts
if (
  existsSync(finalOutputFile) &&
  (!appConfig.validation.isThai ||
    isThai(readFileSync(finalOutputFile, "utf-8")))
) {
  writeFileSync(file, readFileSync(finalOutputFile, "utf-8"));
  // ... existing cleanup ...
  if (appConfig.pipeline.includes("humanization")) {
    appendFileSync(".temp/humanized.txt", `${file}\n`);
  }
  removeFirstFromQueue();
  break;
}
```

Important: only append AFTER isThai passes, not after humanization completes. This way, if humanization produces non-Thai output, the file is NOT marked and can be retried.

**In `init_queue.ts`**: Filter out files already in `humanized.txt`:

```ts
const humanized = existsSync(".temp/humanized.txt")
  ? readFileSync(".temp/humanized.txt", "utf-8")
  : "";
const queue = files.filter(
  (file) => !skips.includes(file) && !humanized.includes(file),
);
```

**In `runner.ts`**: Initialize `.temp/humanized.txt` as empty (same as `skip.txt`).

Also add temp file cleanup in the `catch` block (line 112) to prevent orphaned files from failed chapters:

```ts
} catch (e) {
  Logger.warn(`Found error on ${file}. Skipping this file.`);
  // Clean up temp files for this file
  const safeName = file.replaceAll("/", "_");
  for (const prefix of ["extraction_", "translated_", "consistency_checked_", "final_humanized_"]) {
    const p = `.temp/${prefix}${safeName}`;
    if (existsSync(p)) rmSync(p);
  }
  removeFirstFromQueue();
  continue;
}
```

### 3. Update `extractExistedWords` (`utils/dictionary.ts`)

Add an options parameter:

```ts
interface ExtractOptions {
  searchByThai?: boolean;    // Search by Thai translation value instead of original key
  genderOnly?: boolean;      // Only include entries that have a `gender` field
}

export function extractExistedWords(content: string, options?: ExtractOptions) {
```

Logic changes:

- When `searchByThai` is true: match `content` against `value.translations[0]` (Thai) instead of the dictionary key (Japanese/English)
- When `genderOnly` is true: filter to entries where `value` has a `gender` property (and it's non-empty)
- Both filters can combine (Thai search + gender-only)

### 4. Update instruction files to pass new options

**`instructions/3_consistency.ts:35`** and **`instructions/4_humanization.ts:38`**:

Same auto-detection — when pipeline doesn't include extraction/translation, pass options:

```ts
const isThaiPipeline =
  !appConfig.pipeline.includes("extraction") &&
  !appConfig.pipeline.includes("translation");
const existedWords = extractExistedWords(
  originalHtml,
  isThaiPipeline ? { searchByThai: true, genderOnly: true } : undefined,
);
```

Note: `originalHtml` is Thai in the Thai-input scenario (read from `file`), so `searchByThai: true` correctly matches it against Thai dictionary values.

---

## File Change Summary

| File                             | Change                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `init_queue.ts`                  | Import `extractThai`, auto-detect source from pipeline, filter out `humanized.txt` entries |
| `runner_api.ts`                  | Append to `humanized.txt` after isThai check passes, add temp cleanup in catch block       |
| `runner.ts`                      | Initialize `.temp/humanized.txt` as empty                                                  |
| `utils/extract.ts`               | Add `.sort(chapterSortFn)` to `extractThai()`                                              |
| `utils/dictionary.ts`            | Add `ExtractOptions` param with `searchByThai` and `genderOnly`                            |
| `instructions/3_consistency.ts`  | Auto-detect Thai pipeline, pass options to `extractExistedWords`                           |
| `instructions/4_humanization.ts` | Auto-detect Thai pipeline, pass options to `extractExistedWords`                           |

---

## Verification

1. **Scenario #4** (`consistency => humanization`): Set `pipeline: ["consistency", "humanization"]`. Run `bun init_queue.ts` — verify queue contains Thai files (auto-detected, sorted). Run `bun runner.ts` — verify consistency and humanization process Thai files, dictionary searches by Thai word, gender-only entries are used. Verify `humanized.txt` is populated after isThai check passes.

2. **Scenario #5** (`humanization` only): Set `pipeline: ["humanization"]`. Verify queue auto-detects Thai files. Run twice — verify second run skips files already in `humanized.txt`. Verify dictionary searches by Thai word with gender filter.

3. **Regression** (scenarios #1-3): Set `pipeline: ["extraction", "translation", "consistency", "humanization"]`. Verify queue auto-detects non-Thai files. Verify behavior is identical to current — no options passed to `extractExistedWords`. Verify `humanized.txt` is populated but doesn't affect queue (non-Thai files are already excluded).

4. **Temp cleanup**: Trigger an error mid-pipeline (e.g., invalid API key). Verify `.temp/` has no orphaned `extraction_*`, `translated_*`, `consistency_checked_*`, or `final_humanized_*` files after the catch block runs.

5. **Type check**: `bun run tsc --noEmit` passes.
