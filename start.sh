#!/bin/bash
while true; do
  bun prepare.ts
  bun runner.ts && bun finalize.ts && exit 0
  bun finalize.ts &
done