import { JSDOM } from "jsdom";
import { Logger } from "./logger";

export function countLines(content: string) {
  try {
    const document = new JSDOM(content).window.document;
    const lines: string[] = document.body.textContent
      ?.split("\n")
      .map((el) => el.trim())
      .filter(Boolean);
    return lines?.length || 0;
  } catch (e) {
    Logger.error("Error counting lines:", e);
    Logger.error(
      "Content (first 10 lines):",
      content.split("\n").slice(0, 10).join("\n"),
    );
    return 0;
  }
}
