---
name: extraction
description: Extract high-impact unique terms from novel source text for translation glossary
keywords:
  - extract
  - glossary
  - terminology
  - character names
  - json
---

## Input

- Source HTML text in `.temp/input.json` under `prompt` field
- Previous chapter content for context (if available)
- Existing glossary terms to avoid duplicates

## Output

Write to `.temp/output.txt` as valid JSON with this exact schema:

```json
{
  "items": [
    {
      "name": "Original term in source language",
      "type": "character" or "terminology",
      "gender": "Male/Female/Unknown (for characters only)",
      "base_style": "Thai speaking style description",
      "negative_constraints": "Thai phrases this character never uses",
      "example": [{"input": "source phrase", "output": "Thai equivalent"}],
      "translations": ["Thai translation(s)"],
      "description": "Thai description of the term"
    }
  ]
}
```

## Rules

- Extract ONLY high-impact terms: character names, unique locations, special artifacts/spells
- IGNORE common nouns, verbs, adjectives unless part of a proper title
- The `name` field MUST be in the original source language
- All other fields MUST be in Thai
- Do not re-extract terms already in the existing glossary unless providing a correction/new detail
- Skip entries with full-width Japanese numbers (０-９) that contain "ตอน" (indicates chapter markers)
