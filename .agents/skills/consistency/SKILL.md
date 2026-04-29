---
name: consistency
description: Review and fix translated Thai text for terminology, pronoun, and character voice consistency
keywords:
  - consistency
  - qa editor
  - terminology
  - pronouns
  - character voice
---

## Input

- Original source HTML (`original_text`)
- Current translated HTML (`translated_text`)
- Glossary of established terms (`existed_words_reference`)
- Previous chapter content for context (if available)

## Output

Write to `.temp/output.txt` as raw corrected HTML only - NO markdown, NO explanations.

## Critical Constraints

1. **Structural Integrity**: NEVER alter, merge, or remove HTML tags. Line count must match the original EXACTLY.
2. **Focus on Consistency Only**: This pass is for fixing inconsistencies, NOT for prose polishing (that's the humanization pass).

## What to Fix

1. **Terminology Enforcement**:
   - Cross-reference every name, place, and artifact against the glossary
   - Replace any translations that don't match the glossary exactly
2. **Pronoun/Persona Consistency**:
   - Ensure gender pronouns are consistent throughout (Male: ผม/นาย/ครับ; Female: หนู/ดิฉัน/เธอ/ฉัน/ค่ะ/คะ)
   - Apply character-specific `base_style` and `negative_constraints` from glossary
3. **Character Voice**:
   - Ensure each character speaks consistently with their established personality
   - Fix any pronoun or particle mismatches for known characters

## Process

1. Map each line of translated text to its corresponding original line
2. For each line, verify:
   - Terminology matches glossary
   - Pronouns match character's established gender and style
   - Character voice is consistent with glossary constraints
3. Fix any inconsistencies while preserving HTML structure
4. Verify output line count equals input line count
