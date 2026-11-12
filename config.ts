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
    gemini: "gemini-flash-lite-latest",
    opencode: "console-gemini-proxy/gemini-flash-lite-latest#high",
    openrouter: "nvidia/nemotron-3-ultra-550b-a55b:free",
  },
  geminiAPIKeys: process.env.GEMINI_API_KEY
    ? process.env.GEMINI_API_KEY.split(",")
    : [],
  openrouterAPIKeys: process.env.OPENROUTER_API_KEY
    ? process.env.OPENROUTER_API_KEY.split(",")
    : [],
  pipeline: ["extraction", "translation", "consistency", "humanization"],
  skipProhibitedContent: false,
  skipHighDemand: false,
  loopSkip: true,
  previousChunk: 30,
  chunkSize: 100,
  thinking: "high",
  autoPushDictionasry: true,
  epub_seprarator: ["*", "※", "◇"],
  validation: {
    retriesLimit: 0,
    lineCount: true,
    isThai: true,
    quoteCount: true,
    parenthesesCount: true,
    startCharacter: false,
    badCharacter: false,
  },
  debug: false,
};
