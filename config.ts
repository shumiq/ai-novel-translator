export const config = {
  originalPath: "",
  outputPath: "",
  dictionaryPath: "",
  title: "",
  provider: "gemini",
  model: "gemini-3.1-flash-lite-preview",
  apiKeys: process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.split(",")
    : [],
  language: "Japanese",
  runner: "api",
  pipeline: ["extraction", "translation", "consistency", "humanization"],
  skipProhibitedContent: false,
  skipHighDemand: false,
  loopSkip: true,
  chunkSize: 200,
  thinking: "medium",
  debug: false,
};
