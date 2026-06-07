:loop
bun prepare.ts
bun init_queue.ts
bun runner.ts
if %errorlevel% equ 0 (
  bun finalize.ts
  exit /b 0
)
start /B bun finalize.ts
goto loop