/** UTF-16 offsets intentionally match DOM Range offsets; source text is never rewritten. */
export interface TextSpan {
  text: string;
  start: number;
  end: number;
}

export function lookupTokens(text: string): TextSpan[] {
  return Array.from(
    text.matchAll(/[\p{L}\p{M}\p{N}]+(?:['’ʼ‐‑-][\p{L}\p{M}\p{N}]+)*/gu),
    (match) => ({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    }),
  );
}

/** This is a search key only. Keep the original surface and context alongside it. */
export function normalizeLookupQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^[“”"([{.,!?;:]+|[“”")\]}.,!?;:]+$/gu, "")
    .trim()
    .toLocaleLowerCase("en");
}

/** Permit bounded phrases, contractions and Unicode across inline/line boundaries. */
export function validLookupSelection(value: string): boolean {
  const trimmed = value.trim();
  const tokens = lookupTokens(trimmed);
  return (
    trimmed.length > 0 &&
    trimmed.length <= 160 &&
    tokens.length > 0 &&
    tokens.length <= 12 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/u.test(trimmed)
  );
}

export function sentenceSpans(text: string): TextSpan[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return Array.from(segmenter.segment(text), ({ segment, index }) => ({
    text: segment,
    start: index,
    end: index + segment.length,
  }));
}

/** Extract the smallest sentence context covering the selection, bounded for privacy. */
export function extractLookupContext(
  text: string,
  start: number,
  end: number,
  maxContextLength = 1_000,
): {
  surface: string;
  context: string;
  contextStart: number;
  contextEnd: number;
} | null {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > text.length ||
    !Number.isSafeInteger(maxContextLength) ||
    maxContextLength < end - start ||
    maxContextLength > 1_000 ||
    !validLookupSelection(text.slice(start, end))
  )
    return null;
  const sentences = sentenceSpans(text);
  const first = sentences.find((span) => span.end > start);
  const last = sentences.find((span) => span.end >= end);
  let contextStart = first?.start ?? start;
  let contextEnd = last?.end ?? end;
  if (contextEnd - contextStart > maxContextLength) {
    contextStart = Math.max(
      contextStart,
      start - Math.floor((maxContextLength - (end - start)) / 2),
    );
    contextEnd = Math.min(text.length, contextStart + maxContextLength);
  }
  return {
    surface: text.slice(start, end),
    context: text.slice(contextStart, contextEnd),
    contextStart,
    contextEnd,
  };
}
