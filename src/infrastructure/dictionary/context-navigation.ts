import {
  assertLocalWritesAllowed,
  areLocalWritesSuspended,
} from "@/infrastructure/storage/local-write-guard";
export interface DictionarySourceAnchor {
  documentId?: string;
  documentVersion: string;
  chapterId: string;
  paragraphIndex: number;
  characterOffset: number;
}
export interface DictionaryVisitContext {
  surface: string;
  excerpt: string;
  returnHref: string;
  source?: DictionarySourceAnchor;
}
type ContextStorage = Pick<Storage, "getItem" | "setItem">;
export const DICTIONARY_CONTEXT_KEY = "lexis.dictionary.context.v1";
const MAX_CONTEXTS = 12;

/** Never allow an external redirect, protocol-relative URL or arbitrary API route. */
export function safeDictionaryReturnHref(
  value: string | null | undefined,
): string {
  if (
    !value ||
    value.length > 1_000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/u.test(value)
  )
    return "/library";
  try {
    const url = new URL(value, "https://lexis.invalid");
    if (
      url.origin !== "https://lexis.invalid" ||
      !/^\/(?:reader(?:\/[A-Za-z0-9_-]+)?|writing(?:\/[A-Za-z0-9_-]+)?|library|dictionary|learn(?:\/(?:practice|grammar))?|core(?:\/(?:network|observatory))?|tutor\/chat|grammar(?:\/[A-Za-z0-9_-]+)?)$/u.test(
        url.pathname,
      )
    )
      return "/library";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/library";
  }
}

function readContext(input: unknown): DictionaryVisitContext {
  if (!input || typeof input !== "object")
    throw new Error("Reading context could not be opened.");
  const value = input as Record<string, unknown>;
  if (
    typeof value.surface !== "string" ||
    value.surface.length > 160 ||
    !value.surface.trim() ||
    typeof value.excerpt !== "string" ||
    value.excerpt.length > 1_000 ||
    typeof value.returnHref !== "string"
  )
    throw new Error("Reading context could not be opened.");
  let source: DictionarySourceAnchor | undefined;
  if (value.source !== undefined) {
    if (!value.source || typeof value.source !== "object")
      throw new Error("Reading context could not be opened.");
    const anchor = value.source as Record<string, unknown>;
    if (
      typeof anchor.documentVersion !== "string" ||
      anchor.documentVersion.length > 200 ||
      typeof anchor.chapterId !== "string" ||
      anchor.chapterId.length > 512 ||
      !Number.isSafeInteger(anchor.paragraphIndex) ||
      (anchor.paragraphIndex as number) < 0 ||
      !Number.isSafeInteger(anchor.characterOffset) ||
      (anchor.characterOffset as number) < 0 ||
      (anchor.documentId !== undefined &&
        (typeof anchor.documentId !== "string" ||
          anchor.documentId.length > 200))
    )
      throw new Error("Reading context could not be opened.");
    source = {
      ...(anchor.documentId ? { documentId: anchor.documentId as string } : {}),
      documentVersion: anchor.documentVersion,
      chapterId: anchor.chapterId,
      paragraphIndex: anchor.paragraphIndex as number,
      characterOffset: anchor.characterOffset as number,
    };
  }
  return {
    surface: value.surface,
    excerpt: value.excerpt,
    returnHref: safeDictionaryReturnHref(value.returnHref),
    ...(source ? { source } : {}),
  };
}

function readLedger(
  storage: ContextStorage,
): { id: string; context: DictionaryVisitContext }[] {
  const raw = storage.getItem(DICTIONARY_CONTEXT_KEY);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("visits" in value) ||
    !Array.isArray(value.visits) ||
    value.visits.length > MAX_CONTEXTS
  )
    throw new Error("Reading context could not be opened.");
  return value.visits.map((visit: unknown) => {
    if (
      !visit ||
      typeof visit !== "object" ||
      !("id" in visit) ||
      typeof visit.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,100}$/u.test(visit.id) ||
      !("context" in visit)
    )
      throw new Error("Reading context could not be opened.");
    return { id: visit.id, context: readContext(visit.context) };
  });
}

export function buildDictionaryHref({
  query,
  senseId,
  level = "full",
  contextToken,
  returnHref,
}: {
  query: string;
  senseId?: string;
  level?: "full" | "deep";
  contextToken?: string;
  returnHref?: string;
}): string {
  const params = new URLSearchParams({ q: query.slice(0, 160), level });
  if (senseId) params.set("sense", senseId.slice(0, 200));
  if (contextToken) params.set("visit", contextToken);
  if (returnHref) params.set("return", safeDictionaryReturnHref(returnHref));
  return `/dictionary?${params.toString()}`;
}

/** Context stays in this tab's sessionStorage; never place private excerpts in URLs. */
export function createDictionaryContextLink(
  input: DictionaryVisitContext & { senseId?: string; level?: "full" | "deep" },
  storage: ContextStorage = window.sessionStorage,
  id: string = crypto.randomUUID(),
): string {
  if (typeof window !== "undefined")
    assertLocalWritesAllowed(window.localStorage);
  if (!/^[A-Za-z0-9_-]{1,100}$/u.test(id))
    throw new Error("Reading context could not be kept.");
  const context = readContext(input);
  const visits = readLedger(storage).filter((visit) => visit.id !== id);
  visits.push({ id, context });
  storage.setItem(
    DICTIONARY_CONTEXT_KEY,
    JSON.stringify({ version: 1, visits: visits.slice(-MAX_CONTEXTS) }),
  );
  return buildDictionaryHref({
    query: context.surface,
    senseId: input.senseId,
    level: input.level,
    contextToken: id,
    returnHref: context.returnHref,
  });
}

export function loadDictionaryVisit(
  token: string,
  storage: ContextStorage = window.sessionStorage,
): DictionaryVisitContext | null {
  if (areLocalWritesSuspended()) return null;
  if (!/^[A-Za-z0-9_-]{1,100}$/u.test(token)) return null;
  return (
    readLedger(storage).find((visit) => visit.id === token)?.context ?? null
  );
}

/** Account switching/reset must clear this ephemeral private-context cache too. */
export function clearDictionaryVisits(
  storage: Pick<Storage, "removeItem"> = window.sessionStorage,
): void {
  storage.removeItem(DICTIONARY_CONTEXT_KEY);
}

/** Reuses the same bounded private context; no excerpt or conversation is placed in a URL. */
export function createTutorContextLink(
  input: DictionaryVisitContext,
  storage: ContextStorage = window.sessionStorage,
  id = crypto.randomUUID(),
): string {
  const url = new URL(
    createDictionaryContextLink(input, storage, id),
    "https://lexis.invalid",
  );
  url.pathname = "/tutor/chat";
  for (const key of ["q", "level", "sense"]) url.searchParams.delete(key);
  return url.pathname + url.search;
}
