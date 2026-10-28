import type {
  DictionaryLookupPort,
  DictionaryLookupRequest,
  DictionaryLookupResult,
  DictionaryMatch,
  LookupDictionaryEntry,
} from "@/application/dictionary-lookup";
import { normalizeLookupQuery } from "@/domain/contextual-lookup";
import { EDITORIAL_FORMS } from "./editorial-lookup";

export type LocalCatalogEntry = LookupDictionaryEntry & {
  forms?: readonly string[];
};

/** Reader token checks use exact keys only; do not scan every definition per token. */
export function buildLocalCatalogExactIndex(
  entries: readonly LocalCatalogEntry[],
): ReadonlyMap<string, readonly LookupDictionaryEntry[]> {
  const index = new Map<string, LookupDictionaryEntry[]>();
  for (const entry of entries) {
    const forms =
      entry.provenance.kind === "editorial"
        ? (EDITORIAL_FORMS[entry.lexeme.lemma] ?? [])
        : (entry.forms ?? []);
    const keys = new Set(
      [
        entry.lexeme.lemma,
        ...forms,
        ...entry.senses.flatMap((sense) => sense.collocations),
      ]
        .map(normalizeLookupQuery)
        .filter(Boolean),
    );
    for (const key of keys) index.set(key, [...(index.get(key) ?? []), entry]);
  }
  return index;
}

/** Searches each source independently: shared spelling is never a merge decision. */
export function localCatalogMatches(
  entries: readonly LocalCatalogEntry[],
  query: string,
): DictionaryMatch[] {
  const normalized = normalizeLookupQuery(query);
  const matches: DictionaryMatch[] = [];
  for (const entry of entries) {
    const forms =
      entry.provenance.kind === "editorial"
        ? (EDITORIAL_FORMS[entry.lexeme.lemma] ?? [])
        : (entry.forms ?? []);
    const exact = normalizeLookupQuery(entry.lexeme.lemma) === normalized;
    const form = forms.some(
      (value) => normalizeLookupQuery(value) === normalized,
    );
    const collocation = entry.senses.some((sense) =>
      sense.collocations.some(
        (value) => normalizeLookupQuery(value) === normalized,
      ),
    );
    const text = [
      entry.lexeme.lemma,
      ...entry.senses.flatMap((sense) => [
        sense.definition,
        sense.translation,
        ...sense.collocations,
      ]),
    ].join(" ");
    if (
      exact ||
      form ||
      collocation ||
      normalizeLookupQuery(text).includes(normalized)
    ) {
      matches.push({
        entry,
        forms,
        surface: query,
        matchedBy: exact
          ? "headword"
          : form
            ? "form"
            : collocation
              ? "collocation"
              : "text-search",
      });
    }
  }
  const precise = matches.filter((match) => match.matchedBy !== "text-search");
  return precise.length ? precise : matches;
}

export class LocalCatalogDictionaryLookup implements DictionaryLookupPort {
  readonly capability = {
    supported: true,
    configured: true,
    availableNow: true,
    mode: "local-cache" as const,
  };
  constructor(private readonly entries: readonly LocalCatalogEntry[]) {}
  async lookup({
    query,
    context,
    signal,
  }: DictionaryLookupRequest): Promise<DictionaryLookupResult> {
    if (signal?.aborted) return { status: "cancelled" };
    if (query.length > 160 || (context?.length ?? 0) > 1000)
      return { status: "unavailable", reason: "invalid-input" };
    const matches = localCatalogMatches(this.entries, query);
    await Promise.resolve();
    if (signal?.aborted) return { status: "cancelled" };
    return matches.length
      ? { status: "found", matches, coverage: "local-catalog" }
      : { status: "not-found", coverage: "local-catalog" };
  }
}
