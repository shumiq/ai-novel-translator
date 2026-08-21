export const novelConfig = {
  originalPath: "", // Don't need for EPUB
  outputPath: "", // Don't need for EPUB
  dictionaryPath: "",
  title: "", // Don't need for EPUB
  originalLanguage: "Japanese",
  additionalContext: [],
};

export const appConfig = {
  provider: "gemini",
  model: {
    gemini: "gemini-3.5-flash-lite",
    opencode: "google/gemini-3.1-flash-lite",
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
  epub_seprarator: ["※"],
  validation: {
    retriesLimit: 0,
    lineCount: true,
    isThai: true,
    quouteCount: false,
    parenthesesCount: true,
    startCharacter: true,
    badCharacter: false,
  },
  debug: false,
};
