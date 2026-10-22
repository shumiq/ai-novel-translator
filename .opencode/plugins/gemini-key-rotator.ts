/**
 * gemini-key-rotator — opencode V2 plugin
 *
 * Reads GEMINI_API_KEY from the project's .env file (comma-separated list)
 * and replaces the Google auth header with the next key on every request.
 *
 * The `http.request` hook runs on the final native request, after the provider
 * has applied its own `x-goog-api-key` header, so setting it here always wins.
 */

import { Plugin } from "@opencode/plugin";
import { readFileSync } from "fs";
import { join } from "path";

function loadKeys(directory: string): string[] {
  // 1. prefer process.env if already populated (e.g. shell export)
  if (process.env.GEMINI_API_KEY) {
    const keys = process.env.GEMINI_API_KEY.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length) return keys;
  }

  // 2. fall back to reading the project .env file directly
  try {
    const envPath = join(directory, ".env");
    const raw = readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const stripped = line.trim();
      if (stripped.startsWith("#") || !stripped.includes("=")) continue;
      const eqIdx = stripped.indexOf("=");
      const key = stripped.slice(0, eqIdx).trim();
      if (key !== "GEMINI_API_KEY") continue;
      const value = stripped.slice(eqIdx + 1).trim();
      const keys = value
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      if (keys.length) return keys;
    }
  } catch {
    // .env not found or unreadable — fall through
  }

  return [];
}

export default Plugin.define({
  id: "gemini-key-rotator",

  async setup(ctx) {
    const keys = loadKeys(ctx.location.directory);

    if (keys.length === 0) {
      console.warn(
        "[gemini-key-rotator] No GEMINI_API_KEY found — plugin inactive.",
      );
      return;
    }

    console.log(
      `[gemini-key-rotator] Loaded ${keys.length} key(s). Round-robin rotation active.`,
    );

    // Override the key on every final provider HTTP request, cycling keys.
    let index = 0;
    await ctx.session.hook(
      "http.request",
      (event) => {
        event.request.headers.set("x-goog-api-key", keys[index]);
        index = (index + 1) % keys.length;
      },
      { providerID: "google" },
    );
  },
});
