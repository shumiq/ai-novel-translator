import { config } from "../config";
import { geminiCliRequest, geminiRequest } from "./gemini";
import { lmstudioRequest } from "./lmstudio";

export const aiRequest =
  config.provider === "lmstudio"
    ? lmstudioRequest
    : config.provider === "gemini-cli"
      ? geminiCliRequest
      : geminiRequest;
