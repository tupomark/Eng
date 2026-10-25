import type { Lexeme, Sense } from "./types";
import { normalizeLookupQuery } from "./contextual-lookup";

/** Private learner-authored content; authoring is never a knowledge observation. */
export const USER_LEXICAL_PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "determiner",
  "phrase",
  "other",
] as const;
export type UserLexicalPartOfSpeech =
  (typeof USER_LEXICAL_PARTS_OF_SPEECH)[number];
export const USER_LEXICAL_PROVENANCE = Object.freeze({
  provider: "LEXIS learner",
  version: "user-authored-v1",
  rights: "Private user-authored content; no external dictionary verification.",
  kind: "user-authored" as const,
});
export interface UserLexicalEntry {
  lexeme: Lexeme;
  senses: Sense[];
  forms: string[];
  provenance: typeof USER_LEXICAL_PROVENANCE;
  createdAt: string;
}
export interface UserLexicalCatalog {
  version: 1;
  revision: number;
  entries: UserLexicalEntry[];
}
export const USER_LEXICAL_LIMITS = Object.freeze({
  maxEntries: 2_000,
  maxSenses: 10_000,
  maxSensesPerEntry: 30,
  maxFormsPerEntry: 40,
  maxCollocationsPerSense: 30,
});
export function emptyUserLexicalCatalog(): UserLexicalCatalog {
  return { version: 1, revision: 0, entries: [] };
}
const invalid = () =>
  new Error(
    "Your personal dictionary could not be opened safely. The original data has been preserved.",
  );
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (
    Object.keys(value).length !== allowed.length ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw invalid();
}
function text(value: unknown, max: number, optional = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    throw invalid();
  return value;
}
function id(value: unknown, kind: "lexeme" | "sense"): string {
  const result = text(value, 120);
  if (!new RegExp(`^user-${kind}-[A-Za-z0-9_-]+$`, "u").test(result))
    throw invalid();
  return result;
}
function list(value: unknown, maxCount: number): string[] {
  if (!Array.isArray(value) || value.length > maxCount) throw invalid();
  const result = value.map((item) => text(item, 160));
  if (
    result.some((item) => !normalizeLookupQuery(item)) ||
    new Set(result.map(normalizeLookupQuery)).size !== result.length
  )
    throw invalid();
  return result;
}
function parseSense(value: unknown, lexemeId: string): Sense {
  const item = record(value);
  keys(item, [
    "id",
    "lexemeId",
    "definition",
    "translation",
    "example",
    "collocations",
  ]);
  if (item.lexemeId !== lexemeId) throw invalid();
  return {
    id: id(item.id, "sense"),
    lexemeId,
    definition: text(item.definition, 2_000),
    translation: text(item.translation, 1_000, true),
    example: text(item.example, 2_000, true),
    collocations: list(
      item.collocations,
      USER_LEXICAL_LIMITS.maxCollocationsPerSense,
    ),
  };
}
function parseEntry(value: unknown): UserLexicalEntry {
  const item = record(value);
  keys(item, ["lexeme", "senses", "forms", "provenance", "createdAt"]);
  const lexeme = record(item.lexeme);
  keys(lexeme, ["id", "lemma", "ipa", "partOfSpeech"]);
  const lexemeId = id(lexeme.id, "lexeme");
  const partOfSpeech = text(lexeme.partOfSpeech, 30);
  if (
    !USER_LEXICAL_PARTS_OF_SPEECH.includes(
      partOfSpeech as UserLexicalPartOfSpeech,
    ) ||
    !Array.isArray(item.senses) ||
    !item.senses.length ||
    item.senses.length > USER_LEXICAL_LIMITS.maxSensesPerEntry
  )
    throw invalid();
  const provenance = record(item.provenance);
  keys(provenance, ["provider", "version", "rights", "kind"]);
  for (const key of ["provider", "version", "rights", "kind"] as const)
    if (provenance[key] !== USER_LEXICAL_PROVENANCE[key]) throw invalid();
  const createdAt = text(item.createdAt, 30);
  if (
    !Number.isFinite(Date.parse(createdAt)) ||
    new Date(createdAt).toISOString() !== createdAt
  )
    throw invalid();
  const lemma = text(lexeme.lemma, 160);
  if (!normalizeLookupQuery(lemma)) throw invalid();
  return {
    lexeme: {
      id: lexemeId,
      lemma,
      ipa: text(lexeme.ipa, 160, true),
      partOfSpeech,
    },
    senses: item.senses.map((sense) => parseSense(sense, lexemeId)),
    forms: list(item.forms, USER_LEXICAL_LIMITS.maxFormsPerEntry),
    provenance: { ...USER_LEXICAL_PROVENANCE },
    createdAt,
  };
}
export function parseUserLexicalCatalog(value: unknown): UserLexicalCatalog {
  const input = record(value);
  keys(input, ["version", "revision", "entries"]);
  if (
    input.version !== 1 ||
    !Number.isSafeInteger(input.revision) ||
    Number(input.revision) < 0 ||
    Number(input.revision) >= Number.MAX_SAFE_INTEGER ||
    !Array.isArray(input.entries) ||
    input.entries.length > USER_LEXICAL_LIMITS.maxEntries
  )
    throw invalid();
  const entries = input.entries.map(parseEntry);
  const lexemeIds = new Set<string>();
  const senseIds = new Set<string>();
  for (const entry of entries) {
    if (lexemeIds.has(entry.lexeme.id)) throw invalid();
    lexemeIds.add(entry.lexeme.id);
    for (const sense of entry.senses) {
      if (senseIds.has(sense.id)) throw invalid();
      senseIds.add(sense.id);
    }
  }
  if (senseIds.size > USER_LEXICAL_LIMITS.maxSenses) throw invalid();
  return { version: 1, revision: Number(input.revision), entries };
}

export interface CreateUserLexicalEntryInput {
  lexemeId: string;
  senseId: string;
  lemma: string;
  partOfSpeech: UserLexicalPartOfSpeech;
  definition: string;
  translation?: string;
  example?: string;
  ipa?: string;
  forms?: string[];
  at: string;
}
export function createUserLexicalEntry(
  input: CreateUserLexicalEntryInput,
): UserLexicalEntry {
  return parseEntry({
    lexeme: {
      id: input.lexemeId,
      lemma: input.lemma.trim(),
      ipa: input.ipa?.trim() ?? "",
      partOfSpeech: input.partOfSpeech,
    },
    senses: [
      {
        id: input.senseId,
        lexemeId: input.lexemeId,
        definition: input.definition.trim(),
        translation: input.translation?.trim() ?? "",
        example: input.example?.trim() ?? "",
        collocations: [],
      },
    ],
    forms: input.forms?.map((form) => form.trim()) ?? [],
    provenance: { ...USER_LEXICAL_PROVENANCE },
    createdAt: input.at,
  });
}
/** Content-exact only: no synonym inference, POS merging or external-ID mapping. */
function contentIdentity(entry: UserLexicalEntry): string {
  return JSON.stringify([
    normalizeLookupQuery(entry.lexeme.lemma),
    entry.lexeme.partOfSpeech,
    entry.lexeme.ipa,
    entry.forms,
    entry.senses.map(({ definition, translation, example, collocations }) => [
      definition,
      translation,
      example,
      collocations,
    ]),
  ]);
}
function senseContent(sense: Sense): string {
  return JSON.stringify([
    sense.definition,
    sense.translation,
    sense.example,
    sense.collocations,
  ]);
}
function entryMetadata(entry: UserLexicalEntry): string {
  return JSON.stringify([
    entry.lexeme,
    entry.forms,
    entry.provenance,
    entry.createdAt,
  ]);
}
export function findDuplicateUserLexicalEntry(
  state: UserLexicalCatalog,
  entry: UserLexicalEntry,
): UserLexicalEntry | null {
  const validated = parseUserLexicalCatalog(state);
  const candidate = parseEntry(entry);
  return (
    validated.entries.find(
      (item) => contentIdentity(item) === contentIdentity(candidate),
    ) ?? null
  );
}
export function addUserLexicalEntry(
  state: UserLexicalCatalog,
  entry: UserLexicalEntry,
): UserLexicalCatalog {
  const current = parseUserLexicalCatalog(state);
  const candidate = parseEntry(entry);
  const existing = current.entries.find(
    (item) => item.lexeme.id === candidate.lexeme.id,
  );
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(candidate))
      throw new Error(
        "This personal dictionary ID already belongs to different content. Neither entry has been overwritten.",
      );
    return current;
  }
  // A new delivery of the exact same authored content reuses the original IDs.
  if (findDuplicateUserLexicalEntry(current, candidate)) return current;
  return parseUserLexicalCatalog({
    ...current,
    revision: current.revision + 1,
    entries: [...current.entries, candidate],
  });
}
export interface AppendUserLexicalSenseInput {
  id: string;
  definition: string;
  translation?: string;
  example?: string;
  collocations?: string[];
}
export function appendUserLexicalSense(
  state: UserLexicalCatalog,
  lexemeId: string,
  input: AppendUserLexicalSenseInput,
): UserLexicalCatalog {
  const current = parseUserLexicalCatalog(state);
  const entry = current.entries.find((item) => item.lexeme.id === lexemeId);
  if (!entry)
    throw new Error("Choose an existing personal dictionary entry first.");
  const candidate = parseSense(
    {
      id: input.id,
      lexemeId,
      definition: input.definition.trim(),
      translation: input.translation?.trim() ?? "",
      example: input.example?.trim() ?? "",
      collocations: input.collocations?.map((value) => value.trim()) ?? [],
    },
    lexemeId,
  );
  const existing = current.entries
    .flatMap((item) => item.senses)
    .find((sense) => sense.id === candidate.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(candidate))
      throw new Error(
        "This meaning ID already belongs to different content. Its history has not been reassigned.",
      );
    return current;
  }
  const repeated = entry.senses.some(
    (sense) => senseContent(sense) === senseContent(candidate),
  );
  if (repeated) return current;
  return parseUserLexicalCatalog({
    ...current,
    revision: current.revision + 1,
    entries: current.entries.map((item) =>
      item.lexeme.id === lexemeId
        ? { ...item, senses: [...item.senses, candidate] }
        : item,
    ),
  });
}

export interface UserLexicalRestorePreview {
  entriesToAdd: number;
  sensesToAdd: number;
  unchangedEntries: number;
  conflicts: string[];
  merged: UserLexicalCatalog | null;
}
export function previewUserLexicalRestore(
  state: UserLexicalCatalog,
  incoming: UserLexicalCatalog,
): UserLexicalRestorePreview {
  const current = parseUserLexicalCatalog(state);
  const imported = parseUserLexicalCatalog(incoming);
  const entries = current.entries.map((entry) => ({
    ...entry,
    senses: [...entry.senses],
  }));
  const byLexeme = new Map(entries.map((entry) => [entry.lexeme.id, entry]));
  const bySense = new Map(
    entries.flatMap((entry) =>
      entry.senses.map((sense) => [sense.id, sense] as const),
    ),
  );
  const conflicts: string[] = [];
  let entriesToAdd = 0;
  let sensesToAdd = 0;
  let unchangedEntries = 0;
  for (const candidate of imported.entries) {
    const existing = byLexeme.get(candidate.lexeme.id);
    if (existing) {
      if (entryMetadata(existing) !== entryMetadata(candidate)) {
        conflicts.push(
          `Entry ${candidate.lexeme.id} has different original content.`,
        );
        continue;
      }
    }
    let added = false;
    const additions: Sense[] = [];
    for (const sense of candidate.senses) {
      const original = bySense.get(sense.id);
      if (original && JSON.stringify(original) !== JSON.stringify(sense)) {
        conflicts.push(`Meaning ${sense.id} has different original content.`);
        continue;
      }
      if (!original) {
        additions.push(sense);
        bySense.set(sense.id, sense);
        sensesToAdd++;
        added = true;
      }
    }
    if (!existing) {
      const addition = { ...candidate, senses: additions };
      entries.push(addition);
      byLexeme.set(candidate.lexeme.id, addition);
      entriesToAdd++;
    } else if (added) {
      existing.senses.push(...additions);
    } else {
      unchangedEntries++;
    }
  }
  let merged: UserLexicalCatalog | null = null;
  if (!conflicts.length) {
    try {
      merged = parseUserLexicalCatalog({
        ...current,
        revision: current.revision + (entriesToAdd || sensesToAdd ? 1 : 0),
        entries,
      });
    } catch {
      conflicts.push(
        "The combined personal dictionary exceeds its safe local entry or meaning limits.",
      );
    }
  }
  return {
    entriesToAdd,
    sensesToAdd,
    unchangedEntries,
    conflicts,
    merged,
  };
}
/** Restoration preserves stable IDs, including equal-looking historical meanings. */
export function mergeUserLexicalCatalog(
  current: UserLexicalCatalog,
  incoming: UserLexicalCatalog,
): UserLexicalCatalog {
  const preview = previewUserLexicalRestore(current, incoming);
  if (!preview.merged)
    throw new Error(
      `Personal dictionary restore needs resolution. ${preview.conflicts.join(" ")} Existing data has not been overwritten.`,
    );
  return preview.merged;
}
