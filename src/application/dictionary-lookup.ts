import type { Lexeme, Sense } from "@/domain";

export interface DictionaryContentSource {
  provider: string;
  version: string;
  rights: string;
  kind: "editorial" | "licensed" | "ai-suggestion" | "user-authored";
}
export interface LookupDictionaryEntry {
  lexeme: Lexeme;
  senses: Sense[];
  provenance: DictionaryContentSource;
}
export interface DictionaryMatch {
  entry: LookupDictionaryEntry;
  matchedBy: "headword" | "form" | "collocation" | "text-search";
  surface: string;
  /** Explicit editorial forms, not guessed stemming. */
  forms: readonly string[];
}
export interface DictionaryLookupRequest {
  query: string;
  /** Bounded local context; an adapter must not expand it to the user's corpus. */
  context?: string;
  signal?: AbortSignal;
}
export type DictionaryLookupResult =
  | {
      status: "found";
      matches: DictionaryMatch[];
      coverage: "editorial-sample" | "provider" | "local-catalog";
    }
  | {
      status: "not-found";
      coverage: "editorial-sample" | "provider" | "local-catalog";
    }
  | {
      status: "unavailable";
      reason:
        | "awaiting-configuration"
        | "offline"
        | "timeout"
        | "provider-error"
        | "invalid-input";
    }
  | { status: "cancelled" };

export interface DictionaryLookupPort {
  readonly capability: {
    supported: boolean;
    configured: boolean;
    availableNow: boolean;
    mode: "editorial-cache" | "local-cache" | "remote";
  };
  lookup(request: DictionaryLookupRequest): Promise<DictionaryLookupResult>;
}
