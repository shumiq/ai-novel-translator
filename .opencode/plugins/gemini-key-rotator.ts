/**
 * gemini-key-rotator — opencode V2 plugin
 *
 * Reads GEMINI_API_KEY from the project's .env file (comma-separated list),
 * then overrides the built-in Google provider with round-robin key rotation.
 *
 * - provider transform : sets the google provider's apiKey to the first key so
 *                        opencode treats the provider as authenticated.
 * - model.request hook : injects x-goog-api-key with the next key in the pool
 *                        on every model request, rotating across all keys.
 *
 * No external npm packages needed — only Bun built-ins (fs, path).
 */

import { readFileSync } from "fs";
import { join } from "path";

import { Plugin } from "@opencode/plugin";

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

    // Tell opencode the google provider is authenticated by setting the first
    // key on its settings. This makes the model list work.
    await ctx.provider.transform((editor) => {
      editor.update("google", (provider) => {
        provider.settings = { ...provider.settings, apiKey: keys[0] };
      });
    });

    // Override the key on every model request, cycling through all keys.
    let index = 0;
    await ctx.session.hook(
      "model.request",
      (event) => {
        event.headers["x-goog-api-key"] = keys[index];
        index = (index + 1) % keys.length;
      },
      { providerID: "google" },
    );
  },
});
