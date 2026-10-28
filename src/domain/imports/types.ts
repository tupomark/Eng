export type ImportDisposition =
  "pending" | "accepted" | "deferred" | "rejected";

export interface ImportRow {
  id: string;
  rowNumber: number;
  original: string[];
  term: string;
  translation: string;
  context: string;
  source: string;
  partOfSpeech: string;
  disposition: ImportDisposition;
  /** A proposal stays unresolved until the learner explicitly chooses a sense. */
  senseId: string | null;
  duplicateOf?: string;
  error?: string;
}

export interface ImportBatch {
  id: string;
  sourceName: string;
  format: "txt" | "csv" | "xlsx" | "paste";
  createdAt: string;
  rows: ImportRow[];
  rolledBackAt?: string;
}

export const IMPORT_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 10_000,
  maxColumns: 32,
  maxCellCharacters: 10_000,
  maxTotalCharacters: 5_000_000,
  yieldEveryRows: 100,
} as const;

export interface ParseControl {
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
  /** Injected for deterministic cancellation tests; browser default yields a task. */
  yieldControl?: () => Promise<void>;
}
