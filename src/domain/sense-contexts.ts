/** Durable private excerpts are learning sources, never knowledge observations. */
export interface SenseContextSource {
  documentId?: string;
  documentVersion: string;
  chapterId: string;
  paragraphIndex: number;
  characterOffset: number;
}
export interface SavedSenseContext {
  id: string;
  senseId: string;
  surface: string;
  excerpt: string;
  source?: SenseContextSource;
  savedAt: string;
}
export interface SenseContextState {
  version: 1;
  revision: number;
  contexts: SavedSenseContext[];
}
export const MAX_SENSE_CONTEXTS = 2_000;
export const emptySenseContexts = (): SenseContextState => ({
  version: 1,
  revision: 0,
  contexts: [],
});
const invalid = () =>
  new Error(
    "Saved passages could not be opened. Their original data has been preserved.",
  );
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw invalid();
  return value;
};
const natural = (value: unknown): number => {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) >= Number.MAX_SAFE_INTEGER
  )
    throw invalid();
  return Number(value);
};
function parseSource(value: unknown): SenseContextSource | undefined {
  if (value === undefined) return undefined;
  const source = record(value);
  if (
    Object.keys(source).some(
      (key) =>
        ![
          "documentId",
          "documentVersion",
          "chapterId",
          "paragraphIndex",
          "characterOffset",
        ].includes(key),
    )
  )
    throw invalid();
  return {
    ...(source.documentId === undefined
      ? {}
      : { documentId: text(source.documentId, 200) }),
    documentVersion: text(source.documentVersion, 200),
    chapterId: text(source.chapterId, 512),
    paragraphIndex: natural(source.paragraphIndex),
    characterOffset: natural(source.characterOffset),
  };
}
function parseContext(value: unknown): SavedSenseContext {
  const item = record(value);
  if (
    Object.keys(item).some(
      (key) =>
        !["id", "senseId", "surface", "excerpt", "source", "savedAt"].includes(
          key,
        ),
    )
  )
    throw invalid();
  const id = text(item.id, 120);
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) throw invalid();
  const savedAt = text(item.savedAt, 30);
  if (
    !Number.isFinite(Date.parse(savedAt)) ||
    new Date(savedAt).toISOString() !== savedAt
  )
    throw invalid();
  const source = parseSource(item.source);
  return {
    id,
    senseId: text(item.senseId, 200),
    surface: text(item.surface, 160),
    excerpt: text(item.excerpt, 1_000),
    ...(source ? { source } : {}),
    savedAt,
  };
}
/** Exact original excerpt + structural address + stable sense; no semantic merging. */
export function senseContextIdentity(
  value: Pick<SavedSenseContext, "senseId" | "excerpt" | "source">,
): string {
  const source = value.source;
  return JSON.stringify([
    value.senseId,
    value.excerpt,
    source
      ? [
          source.documentId ?? null,
          source.documentVersion,
          source.chapterId,
          source.paragraphIndex,
          source.characterOffset,
        ]
      : null,
  ]);
}
export function parseSenseContexts(value: unknown): SenseContextState {
  const input = record(value);
  if (
    Object.keys(input).length !== 3 ||
    input.version !== 1 ||
    !Array.isArray(input.contexts) ||
    input.contexts.length > MAX_SENSE_CONTEXTS
  )
    throw invalid();
  const contexts = input.contexts.map(parseContext);
  const ids = new Set<string>();
  const identities = new Set<string>();
  for (const item of contexts) {
    const identity = senseContextIdentity(item);
    if (ids.has(item.id) || identities.has(identity)) throw invalid();
    ids.add(item.id);
    identities.add(identity);
  }
  return { version: 1, revision: natural(input.revision), contexts };
}
export function addSenseContext(
  state: SenseContextState,
  input: SavedSenseContext,
): SenseContextState {
  const current = parseSenseContexts(state);
  const item = parseContext(input);
  const byId = current.contexts.find((context) => context.id === item.id);
  if (byId && senseContextIdentity(byId) !== senseContextIdentity(item))
    throw new Error(
      "This passage ID conflicts with a different saved source. Neither has been overwritten.",
    );
  if (
    current.contexts.some(
      (context) => senseContextIdentity(context) === senseContextIdentity(item),
    )
  )
    return current;
  return parseSenseContexts({
    ...current,
    revision: current.revision + 1,
    contexts: [...current.contexts, item],
  });
}
export function removeSenseContext(
  state: SenseContextState,
  id: string,
): SenseContextState {
  const current = parseSenseContexts(state);
  if (!current.contexts.some((item) => item.id === id)) return current;
  return parseSenseContexts({
    ...current,
    revision: current.revision + 1,
    contexts: current.contexts.filter((item) => item.id !== id),
  });
}
export function mergeSenseContexts(
  current: SenseContextState,
  incoming: SenseContextState,
): SenseContextState {
  const validated = parseSenseContexts(incoming);
  const base = parseSenseContexts(current);
  const contexts = [...base.contexts];
  const byId = new Map(contexts.map((item) => [item.id, item]));
  const identities = new Set(contexts.map(senseContextIdentity));
  for (const item of validated.contexts) {
    const identity = senseContextIdentity(item);
    const existing = byId.get(item.id);
    if (existing && senseContextIdentity(existing) !== identity)
      throw new Error(
        "This passage ID conflicts with a different saved source. Neither has been overwritten.",
      );
    if (identities.has(identity)) continue;
    contexts.push(item);
    byId.set(item.id, item);
    identities.add(identity);
  }
  return parseSenseContexts({
    ...base,
    contexts,
    revision: base.revision + contexts.length - base.contexts.length,
  });
}
