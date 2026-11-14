export type AIRequest = {
  instruction: string;
  prompt: string;
  body?: object;
};

export type NovelConfig = {
  originalPath: string;
  outputPath: string;
  dictionaryPath: string;
  title: string;
  originalLanguage: string;
  additionalContext: string[];
};

export type Dictonary = {
  [key: string]:
    | {
        gender: string;
        base_style: string;
        negative_constraints: string;
        example: Array<{
          input: string;
          output: string;
        }>;
        translations: Array<string>;
        description: string;
      }
    | {
        description: string;
        translations: Array<string>;
      };
};
