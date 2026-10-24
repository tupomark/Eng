import { IMPORT_LIMITS, type ImportRow, type ParseControl } from "./types";

export function normalizeImportTerm(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/\s+/gu, " ");
}

export function stableTextId(value: string): string {
  // Stable identifiers support idempotent local re-import; this is not a security hash.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function assertNotCancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new Error("Import cancelled. Your collection has not changed.");
}

export function detectDelimiter(text: string): "," | ";" | "\t" {
  let quoted = false;
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (let index = 0; index < Math.min(text.length, 20_000); index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && char in counts) counts[char as keyof typeof counts]++;
    else if (!quoted && (char === "\n" || char === "\r")) break;
  }
  return (Object.keys(counts) as (keyof typeof counts)[]).sort(
    (a, b) => counts[b] - counts[a],
  )[0];
}

/** RFC-style quoted fields, including escaped quotes and embedded newlines. */
export async function parseDelimited(
  input: string,
  delimiter: string = detectDelimiter(input),
  control: ParseControl = {},
): Promise<string[][]> {
  if (![",", ";", "\t"].includes(delimiter))
    throw new Error("Choose comma, semicolon or tab as the separator.");
  if (input.length > IMPORT_LIMITS.maxTotalCharacters)
    throw new Error("This text is too large. Split it into smaller imports.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(input))
    throw new Error(
      "This file contains binary control characters. Choose a plain text or spreadsheet export.",
    );
  const text = input.replace(/^\uFEFF/u, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  const flushCell = () => {
    if (row.length >= IMPORT_LIMITS.maxColumns)
      throw new Error("Too many columns in this file.");
    row.push(cell);
    cell = "";
    afterQuote = false;
  };
  const flushRow = () => {
    flushCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    if (rows.length > IMPORT_LIMITS.maxRows + 1)
      throw new Error("The file exceeds the 10,000-row import limit.");
  };
  const yieldControl =
    control.yieldControl ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (let index = 0; index < text.length; index++) {
    if (index % 32_768 === 0) {
      assertNotCancelled(control.signal);
      control.onProgress?.(index, text.length);
      await yieldControl();
    }
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else cell += char;
    } else if (char === delimiter) flushCell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      flushRow();
    } else if (char === '"' && !cell && !afterQuote) quoted = true;
    else if (afterQuote && char.trim())
      throw new Error(
        "A quoted field has unexpected text after its closing quote.",
      );
    else if (!afterQuote) cell += char;
    if (cell.length > IMPORT_LIMITS.maxCellCharacters)
      throw new Error("A field exceeds the 10,000-character limit.");
  }
  if (quoted)
    throw new Error(
      "A quoted field is unfinished. Check the file before retrying.",
    );
  if (cell || row.length || afterQuote) flushRow();
  assertNotCancelled(control.signal);
  control.onProgress?.(text.length, text.length);
  return rows;
}

const columnNames = {
  term: [
    "word",
    "term",
    "expression",
    "original",
    "original text",
    "source text",
    "english",
    "слово",
    "оригинал",
  ],
  translation: [
    "translation",
    "translated text",
    "target text",
    "russian",
    "перевод",
  ],
  context: [
    "context",
    "example",
    "sentence",
    "original context",
    "контекст",
    "пример",
  ],
  source: ["source", "url", "источник"],
  partOfSpeech: ["pos", "part of speech", "часть речи"],
} as const;

export async function normalizeImportRows(
  cells: string[][],
  batchId: string,
  control: ParseControl = {},
): Promise<ImportRow[]> {
  if (!cells.length)
    throw new Error(
      "No vocabulary rows found. Add a word or expression first.",
    );
  const first = cells[0].map(normalizeImportTerm);
  const termIndex = first.findIndex((name) =>
    (columnNames.term as readonly string[]).includes(name),
  );
  const hasHeader = termIndex >= 0;
  const indices = Object.fromEntries(
    Object.entries(columnNames).map(([key, names]) => [
      key,
      first.findIndex((name) => (names as readonly string[]).includes(name)),
    ]),
  ) as Record<keyof typeof columnNames, number>;
  const data = hasHeader ? cells.slice(1) : cells;
  if (data.length > IMPORT_LIMITS.maxRows)
    throw new Error("The file exceeds the 10,000-row import limit.");
  const seen = new Map<string, string>();
  const rows: ImportRow[] = [];
  const yieldControl =
    control.yieldControl ??
    (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (let index = 0; index < data.length; index++) {
    if (index % IMPORT_LIMITS.yieldEveryRows === 0) {
      assertNotCancelled(control.signal);
      control.onProgress?.(index, data.length);
      await yieldControl();
    }
    const original = data[index];
    if (
      original.length > IMPORT_LIMITS.maxColumns ||
      original.some((cell) => cell.length > IMPORT_LIMITS.maxCellCharacters)
    )
      throw new Error("A row exceeds the supported column or field limit.");
    const get = (key: keyof typeof columnNames, fallback: number) =>
      (original[hasHeader ? indices[key] : fallback] ?? "").trim();
    const row: ImportRow = {
      id: `${batchId}:row:${index + 1}`,
      rowNumber: index + (hasHeader ? 2 : 1),
      original: [...original],
      term: get("term", 0),
      translation: get("translation", 1),
      context: get("context", 2),
      source: get("source", 3),
      partOfSpeech: get("partOfSpeech", 4),
      disposition: "pending",
      senseId: null,
    };
    if (!row.term)
      row.error =
        "Missing word or expression. Edit this row before accepting it.";
    const identity = JSON.stringify(
      [
        row.term,
        row.translation,
        row.context,
        row.source,
        row.partOfSpeech,
      ].map(normalizeImportTerm),
    );
    const duplicate = seen.get(identity);
    if (duplicate) row.duplicateOf = duplicate;
    else seen.set(identity, row.id);
    rows.push(row);
  }
  assertNotCancelled(control.signal);
  control.onProgress?.(data.length, data.length);
  return rows;
}
