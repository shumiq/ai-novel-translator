#!/bin/bash
while true; do
  bun prepare.ts
  bun runner.ts
  bun finalize.ts
done