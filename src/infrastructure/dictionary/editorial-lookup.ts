import type {
  DictionaryLookupPort,
  DictionaryMatch,
  DictionaryLookupRequest,
  DictionaryLookupResult,
} from "@/application/dictionary-lookup";
import { normalizeLookupQuery } from "@/domain/contextual-lookup";
import { seedEntries } from "./seed";

export const EDITORIAL_FORMS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    linger: ["lingered", "lingering", "lingers"],
    wander: ["wandered", "wandering", "wanders"],
    trace: ["traced", "tracing", "traces"],
    glimpse: ["glimpses"],
    quiet: ["quieter", "quietest"],
  });

export class EditorialDictionaryLookup implements DictionaryLookupPort {
  readonly capability = {
    supported: true,
    configured: true,
    availableNow: true,
    mode: "editorial-cache" as const,
  };
  async lookup({
    query,
    context,
    signal,
  }: DictionaryLookupRequest): Promise<DictionaryLookupResult> {
    if (signal?.aborted) return { status: "cancelled" };
    if (query.length > 160 || (context?.length ?? 0) > 1_000)
      return { status: "unavailable", reason: "invalid-input" };
    const normalized = normalizeLookupQuery(query);
    const matches: DictionaryMatch[] = [];
    for (const entry of seedEntries) {
      const forms = EDITORIAL_FORMS[entry.lexeme.lemma] ?? [];
      const exact = normalized === entry.lexeme.lemma;
      const form = forms.includes(normalized);
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
      )
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
    // Also honour cancellation issued just after a synchronous cache read.
    await Promise.resolve();
    if (signal?.aborted) return { status: "cancelled" };
    const precise = matches.filter(
      (match) => match.matchedBy !== "text-search",
    );
    const selected = precise.length ? precise : matches;
    return selected.length
      ? { status: "found", matches: selected, coverage: "editorial-sample" }
      : { status: "not-found", coverage: "editorial-sample" };
  }
}

/** Optional external dictionary remains disabled until credentials, rights and live checks exist. */
export class UnconfiguredDictionaryLookup implements DictionaryLookupPort {
  readonly capability = {
    supported: true,
    configured: false,
    availableNow: false,
    mode: "remote" as const,
  };
  async lookup({
    signal,
  }: DictionaryLookupRequest): Promise<DictionaryLookupResult> {
    return signal?.aborted
      ? { status: "cancelled" }
      : { status: "unavailable", reason: "awaiting-configuration" };
  }
}
