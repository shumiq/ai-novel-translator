export function extractText(line: string | undefined): string | null {
  if (!line) return null;
  const m = line.match(/^<p>(.*)<\/p>$/);
  return m ? (m[1] ?? null) : null;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countOccurrences(text: string, word: string): number {
  if (!word) return 0;
  const regex = new RegExp(escapeRegex(word), "gi");
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

export function highlightIn(text: string, word: string, color: string): string {
  if (!word) return text;
  const regex = new RegExp(escapeRegex(word), "gi");
  const BOLD = "\x1b[1m";
  const RESET = "\x1b[0m";
  return text.replace(regex, (m) => `${BOLD}${color}${m}${RESET}`);
}
