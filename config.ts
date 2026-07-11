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
  model: {
    api: "gemini-3.5-flash",
    agent: "gemini-3.5-flash",
  },
  apiKeys: process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.split(",")
    : [],
  pipeline: ["extraction", "translation", "consistency", "humanization"],
  skipProhibitedContent: false,
  skipHighDemand: false,
  loopSkip: true,
  previousChunk: 30,
  chunkSize: 100,
  thinking: "high",
  validation: {
    retriesLimit: 0,
    lineCount: true,
    isThai: true,
    quouteCount: false,
    parenthesesCount: true,
    startCharacter: true,
  },
  debug: false,
};
