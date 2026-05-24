export const novelConfig = {
  originalPath: "", // Don't need for EPUB
  outputPath: "", // Don't need for EPUB
  dictionaryPath: "",
  title: "", // Don't need for EPUB
  originalLanguage: "Japanese",
  additionalContext: [],
};

export const appConfig = {
  mode: "api",
  fallbackAgent: "opencode",
  model: "gemini-3.1-flash-lite",
  apiKeys: process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.split(",")
    : [],
  pipeline: ["extraction", "translation", "consistency", "humanization"],
  skipProhibitedContent: false,
  skipHighDemand: false,
  loopSkip: false,
  previousChunk: 30,
  chunkSize: 100,
  thinking: "medium",
  debug: false,
};
