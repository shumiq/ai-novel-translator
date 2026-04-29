---
name: humanization
description: Polish translated Thai text for natural, literary flow while maintaining structural integrity
keywords:
  - humanize
  - polish
  - native thai novelist
  - literary flow
  - dialogue
---

## Input

- Original source HTML (`original_text`)
- Current translated HTML (`translated_text`)
- Glossary of established terms (`existed_words_reference`)
- Previous chapter content for context (if available)

## Output

Write to `.temp/output.txt` as raw polished HTML only - NO markdown, NO explanations.

## Critical Constraints

1. **Structural Integrity**: NEVER alter, merge, or remove HTML tags. Line count must match the original EXACTLY.
2. **Preserve Terminology**: Keep all glossary terms intact - do not "improve" established translations.

## What to Improve

1. **Naturalize Sentences**:
   - Fix literal/robotic translations that sound unnatural in Thai
   - Rearrange awkward sentence structures for smooth reading
   - Replace stiff phrasing with idiomatic Thai expressions
2. **Artifact & Clutter Removal**:
   - Remove leftover source-language characters (、, 。, etc.)
   - Eliminate redundant bracketed translations (e.g., 'พล็อตคลาสสิก (Template)' → 'พล็อตคลาสสิก')
3. **Dialogue Optimization**:
   - Ensure dialogue flows like natural Thai conversation
   - Reduce repetitive particles (don't end EVERY sentence with ครับ/ค่ะ/จ๊ะ)
   - Simplify excessive royal vocabulary (คำราชาศัพท์) for modern readability
4. **Word Choice**:
   - Replace unnatural word choices with better Thai equivalents
   - Maintain emotional tone and literary quality
   - Vary sentence structure to avoid monotony

## Process

1. Read each line of translated text
2. Improve the prose while keeping the same meaning and HTML structure
3. Remove any source-language artifacts or formatting clutter
4. Verify output line count equals input line count
5. Read through to ensure the text flows like a published novel

## Style Guidelines

- Aim for published novel quality, not machine translation quality
- Balance fidelity to the original with readability in Thai
- Maintain the emotional tone and pacing of the original
- Dialogue should sound like real people speaking, not translated text
