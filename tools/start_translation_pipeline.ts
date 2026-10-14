// Name: Start Translation Pipeline
// Description: Loop prepare → init_queue → runner until the queue drains, then finalize
import { spawn, spawnSync } from "child_process";

const run = (script: string) =>
  spawnSync("bun", [`tools/${script}`], { stdio: "inherit" });

while (true) {
  run("prepare.ts");
  run("init_queue.ts");

  if (run("runner.ts").status === 0) {
    run("finalize.ts");
    process.exit(0);
  }

  spawn("bun", ["tools/finalize.ts"], { stdio: "inherit" });
}
