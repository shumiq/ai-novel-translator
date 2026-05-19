export const novelConfig = {
  originalPath: "", // Don't need for EPUB
  outputPath: "", // Don't need for EPUB
  dictionaryPath: "",
  title: "", // Don't need for EPUB
  originalLanguage: "Japanese",
};

export const appConfig = {
  mode: "gemini",
  fallbackAgent: "opencode",
  model: "gemini-3.1-flash-lite",
  apiKeys: process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.split(",")
    : [],
  pipeline: ["extraction", "translation", "consistency", "humanization"],
  skipProhibitedContent: false,
  skipHighDemand: false,
  loopSkip: false,
  chunkSize: 200,
  thinking: "medium",
  debug: false,
};
