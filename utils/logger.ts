import { appConfig } from "../config";

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function fmt(parts: string): string {
  return `${c.dim}[${parts}]${c.reset}`;
}

function flat(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === "object" && a !== null) return JSON.stringify(a);
      return String(a);
    })
    .join(" ");
}

let _progressActive = false;

function breakLine() {
  if (_progressActive) {
    process.stdout.write("\n");
    _progressActive = false;
  }
}

function writeLine(prefix: string, msg: string) {
  breakLine();
  console.log(`${prefix} ${msg}`);
}

export const Logger = {
  debug(...args: unknown[]) {
    if (!appConfig.debug) return;
    writeLine(` ${fmt("DEBUG")}`, flat(args));
  },

  info(...args: unknown[]) {
    writeLine(` ${c.green}${c.bold}ℹ${c.reset} `, flat(args));
  },

  warn(...args: unknown[]) {
    writeLine(` ${c.yellow}${c.bold}⚠${c.reset} `, flat(args));
  },

  error(...args: unknown[]) {
    writeLine(` ${c.red}${c.bold}✖${c.reset} `, flat(args));
  },

  progress(...args: unknown[]) {
    const msg = flat(args);
    if (typeof process.stdout.clearLine === "function")
      process.stdout.clearLine(0);
    if (typeof process.stdout.cursorTo === "function")
      process.stdout.cursorTo(0);
    process.stdout.write(`${c.cyan}${c.bold}►${c.reset} ${msg}`);
    _progressActive = true;
  },

  done(...args: unknown[]) {
    writeLine(` ${c.green}${c.bold}✔${c.reset} `, flat(args));
  },

  step(emoji: string, ...args: unknown[]) {
    breakLine();
    console.log(
      ` ${c.bold}${emoji}${c.reset}  ${c.bold}${flat(args)}${c.reset}`,
    );
    console.log("");
  },
};
