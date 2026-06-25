import { extractLinesFromHtml } from "./text";

export function countLines(content: string) {
  try {
    return extractLinesFromHtml(content).length;
  } catch {
    return 0;
  }
}
