import { appConfig } from "../config";

export const Logger = {
  debug(...args: any[]) {
    if (appConfig.debug) {
      console.log(`[DEBUG] ${args.join(" ")}`);
    }
  },
  info(...args: any[]) {
    console.log(`[INFO] ${args.join(" ")}`);
  },
  warn(...args: any[]) {
    console.warn(`[WARN] ${args.join(" ")}`);
  },
  error(...args: any[]) {
    console.error(`[ERROR] ${args.join(" ")}`);
  },
  progress(...args: any[]) {
    // same-line progress logging
    process.stdout.write(`\r[PROGRESS] ${args.join(" ")}`);
  },
};
