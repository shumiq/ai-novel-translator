export function extractText(line: string | undefined): string | null {
  if (!line) return null;
  const m = line.match(/^<p>(.*)<\/p>$/);
  return m ? (m[1] ?? null) : null;
}

/**
 * Decode common HTML entities (&amp; &lt; &gt; &quot; &#39; &nbsp; &#NNN;)
 * back to their actual characters.
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

/**
 * Extract text content from all `<p>` tags in an HTML string.
 * Strips inner HTML tags and decodes HTML entities.
 *
 * JSDOM-free replacement for:
 *   new JSDOM(html).querySelectorAll("p").map(el => el.textContent.trim())
 */
export function extractLinesFromHtml(html: string): string[] {
  const lines: string[] = [];
  const pTagRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = pTagRe.exec(html)) !== null) {
    const inner = match[1];
    if (inner === undefined) continue;
    const text = decodeHtmlEntities(inner.replace(/<[^>]+>/g, "")).trim();
    if (text) lines.push(text);
  }
  return lines;
}

/**
 * Extract the title (first `<p>` tag text) from a simple HTML string
 * where each line is a `<p>` element.
 *
 * JSDOM-free replacement for:
 *   new JSDOM(html).querySelector("p")?.textContent
 */
export function extractTitleFromHtml(html: string): string {
  const normalized = html.replace(/\r\n/g, "\n");
  const firstLine = normalized.split("\n")[0];
  if (!firstLine) return "";
  return firstLine.replace(/<\/?p>/g, "").trim();
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
