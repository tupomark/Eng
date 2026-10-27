export interface ReaderPreferences {
  version: 1;
  font: "sans" | "serif";
  fontSize: 18 | 20 | 23;
  lineSpacing: "comfortable" | "roomy";
}

export const DEFAULT_READER_PREFERENCES: Readonly<ReaderPreferences> = {
  version: 1,
  font: "sans",
  fontSize: 20,
  lineSpacing: "comfortable",
};

export function parseReaderPreferences(value: unknown): ReaderPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid reading preferences.");
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 4 ||
    record.version !== 1 ||
    (record.font !== "sans" && record.font !== "serif") ||
    (record.fontSize !== 18 &&
      record.fontSize !== 20 &&
      record.fontSize !== 23) ||
    (record.lineSpacing !== "comfortable" && record.lineSpacing !== "roomy")
  )
    throw new Error("Invalid reading preferences.");
  return {
    version: 1,
    font: record.font,
    fontSize: record.fontSize,
    lineSpacing: record.lineSpacing,
  };
}
