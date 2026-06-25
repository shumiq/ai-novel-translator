export function isLineCloseQuote(line: string) {
  const openQuoteCount =
    (line.match(/「/g) || []).length + (line.match(/『/g) || []).length;
  const closeQuoteCount =
    (line.match(/」/g) || []).length + (line.match(/』/g) || []).length;
  return openQuoteCount === closeQuoteCount;
}

export function getQuoteBalance(line: string): {
  openCount: number;
  closeCount: number;
  diff: number;
} {
  const openCount =
    (line.match(/「/g) || []).length + (line.match(/『/g) || []).length;
  const closeCount =
    (line.match(/」/g) || []).length + (line.match(/』/g) || []).length;
  return { openCount, closeCount, diff: openCount - closeCount };
}

export function findProblematicLines(content: string): number[] {
  const lines = content.split("\n");
  const problemLines: number[] = [];
  lines.forEach((line, index) => {
    const { openCount, closeCount } = getQuoteBalance(line);
    if (openCount !== closeCount) {
      problemLines.push(index + 1);
    }
  });
  return problemLines;
}
