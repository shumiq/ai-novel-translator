import { JSDOM } from "jsdom";
export function countLines(content: string) {
  const document = new JSDOM(content).window.document;
  const lines: string[] = document.body.textContent
    ?.split("\n")
    .map((el) => el.trim())
    .filter(Boolean);
  return lines?.length || 0;
}
