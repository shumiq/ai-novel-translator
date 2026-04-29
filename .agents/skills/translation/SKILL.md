---
name: translation
description: Translate HTML source text line-by-line from source language to Thai
keywords:
  - translate
  - thai
  - html
  - line-by-line
---

## Input

- Source HTML text in `.temp/input.json` under `prompt` field
- Glossary of established terms (`existed_words_reference`)
- Previous chapter content for context (if available)

## Output

Write to `.temp/output.txt` as raw HTML only - NO markdown, NO explanations.

## Critical Constraints

1. **1:1 Line Mapping**: Every input line must have exactly one output line. NEVER merge, skip, or summarize lines.
2. **HTML Integrity**: NEVER alter, merge, or remove any HTML tags (`<p>`, `<div>`, etc.). Tags must match exactly.
3. **Gender Pronouns** (use context to determine speaker):
   - Male: ผม/นาย/ครับ
   - Female: หนู/ดิฉัน/เธอ/ฉัน/ค่ะ/คะ
   - Gender-neutral: ข้า/เรา/คุณ
4. **Terminology**: Use terms from the glossary EXACTLY as specified for names, places, and artifacts.

## Process

1. Count input lines before translating
2. Translate each line while preserving its HTML tags
3. Verify output line count matches input
4. Check terminology against glossary
5. Apply appropriate gender pronouns based on character context

## Common Pitfalls to Avoid

- Do not translate HTML tag content (attributes, class names, etc.)
- Do not add opening/closing tags that weren't in the original
- Do not change self-closing tags to paired tags or vice versa
- Do not include markdown code fences (```)
