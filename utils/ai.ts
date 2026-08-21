import { appConfig } from "../config";
import type { AIRequest } from "./types";
import { geminiRequest } from "./gemini";
import { opencodeRequest } from "./opencode";

export type { AIRequest } from "./types";
export { HighDemandError, ProhibitedContentError } from "./errors";

export const aiRequest: (request: AIRequest) => Promise<string> = (request) => {
  if (appConfig.provider === "gemini") {
    return geminiRequest(request);
  }
  if (appConfig.provider === "opencode") {
    return opencodeRequest(request);
  }
  throw new Error(`Unknown provider: ${appConfig.provider}`);
};
