:loop
bun tools/prepare.ts
bun tools/init_queue.ts
bun tools/runner.ts
if %errorlevel% equ 0 (
  bun tools/finalize.ts
  exit /b 0
)
start /B bun tools/finalize.ts
goto loop