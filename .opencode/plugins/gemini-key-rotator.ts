/**
 * gemini-key-rotator — opencode plugin
 *
 * Reads GEMINI_API_KEY from the project's .env file (comma-separated list),
 * then overrides the built-in Google provider with round-robin key rotation.
 *
 * - config hook  : sets provider.google.options.apiKey to the first key so
 *                  opencode treats the provider as authenticated.
 * - chat.headers : injects x-goog-api-key with the next key in the pool on
 *                  every single LLM request, rotating through all keys evenly.
 *
 * No external npm packages needed — only Bun built-ins (fs, path).
 */

import { readFileSync } from "fs";
import { join } from "path";

import type { Plugin } from "@opencode-ai/plugin";

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

const plugin: Plugin = async ({ directory }) => {
  const keys = loadKeys(directory);

  if (keys.length === 0) {
    console.warn(
      "[gemini-key-rotator] No GEMINI_API_KEY found — plugin inactive.",
    );
    return {};
  }

  console.log(
    `[gemini-key-rotator] Loaded ${keys.length} key(s). Round-robin rotation active.`,
  );

  // Shared counter — incremented on every chat request
  let index = 0;

  const next = (): string => {
    const key = keys[index % keys.length];
    index = (index + 1) % keys.length;
    return key;
  };

  return {
    // Tell opencode that the google provider is authenticated by setting the
    // first key in the provider options. This makes the model list work and
    // prevents the "not authenticated" banner.
    config: async (cfg) => {
      if (!cfg.provider) cfg.provider = {};
      if (!cfg.provider.google) cfg.provider.google = {};
      if (!cfg.provider.google.options) cfg.provider.google.options = {};
      cfg.provider.google.options.apiKey = keys[0];
    },

    // Override the key on every request via the x-goog-api-key header,
    // cycling through all keys in order.
    "chat.headers": async (input, output) => {
      // Safe check using optional chaining for provider ID
      const providerId = input.provider?.id ?? input.provider;
      if (providerId !== "google") return;

      const key = next();
      output.headers["x-goog-api-key"] = key;
    },
  };
};

export default plugin;
