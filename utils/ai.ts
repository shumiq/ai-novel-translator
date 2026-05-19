import { appConfig } from "../config";
import { geminiCliRequest, geminiRequest } from "./gemini";

export const aiRequest =
  appConfig.mode === "api" ? geminiRequest : geminiCliRequest;
