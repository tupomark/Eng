"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addUserLexicalEntry,
  appendUserLexicalSense,
  createUserLexicalEntry,
  emptyUserLexicalCatalog,
  findDuplicateUserLexicalSense,
  type UserLexicalCatalog,
  type UserLexicalEntry,
  type UserLexicalPartOfSpeech,
} from "@/domain/lexical-catalog";
import type { LookupDictionaryEntry } from "@/application/dictionary-lookup";
import type { Sense } from "@/domain";
import { seedEntries } from "@/infrastructure/dictionary/seed";
import {
  LocalCatalogDictionaryLookup,
  buildLocalCatalogExactIndex,
} from "@/infrastructure/dictionary/local-catalog-lookup";
import {
  BrowserUserLexicalRepository,
  USER_LEXICAL_CATALOG_KEY,
} from "@/infrastructure/storage/browser-lexical-catalog";
import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";
import { subscribeToLocalPurge } from "@/infrastructure/materials/purge-signal";
import { normalizeLookupQuery } from "@/domain/contextual-lookup";

export interface UserLexicalDraft {
  lemma: string;
  partOfSpeech: UserLexicalPartOfSpeech;
  definition: string;
  translation?: string;
  example?: string;
  ipa?: string;
  forms?: string[];
}
export interface UserSenseDraft {
  definition: string;
  translation?: string;
  example?: string;
  collocations?: string[];
}
type Snapshot = { state: UserLexicalCatalog; serialized: string | null };
export type UserMeaningCreation = {
  entry: UserLexicalEntry;
  senseId: string;
  added: boolean;
};
interface CatalogValue {
  entries: LookupDictionaryEntry[];
  userEntries: UserLexicalEntry[];
  ready: boolean;
  error: string;
  lookup: LocalCatalogDictionaryLookup;
  matchingEntries(query: string): readonly LookupDictionaryEntry[];
  findEntry(
    query: string,
    selectedSenseId?: string,
  ): LookupDictionaryEntry | null;
  findSense(id: string): { entry: LookupDictionaryEntry; sense: Sense } | null;
  reload(): void;
  snapshot(): Snapshot | null;
  commit(next: UserLexicalCatalog, expected: string | null): void;
  create(input: UserLexicalDraft): UserMeaningCreation | null;
  addSense(lexemeId: string, input: UserSenseDraft): UserMeaningCreation | null;
}
const CatalogContext = createContext<CatalogValue | null>(null);
function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Your definition could not be saved. Your input and previous history are preserved.";
}
export function LexicalCatalogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState(emptyUserLexicalCatalog);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<Snapshot | null>(null);
  const paused = useRef(false);
  const reload = useCallback(() => {
    if (paused.current) return;
    try {
      const next = new BrowserUserLexicalRepository(window.localStorage).read();
      current.current = next;
      setState(next.state);
      setError("");
    } catch (cause) {
      current.current = null;
      setState(emptyUserLexicalCatalog());
      setError(message(cause));
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) reload();
    });
    const changed = (event: StorageEvent) => {
      if (event.key === USER_LEXICAL_CATALOG_KEY || event.key === null)
        reload();
    };
    window.addEventListener("storage", changed);
    const release = subscribeToLocalPurge(() => {
      paused.current = true;
      current.current = null;
      setState(emptyUserLexicalCatalog());
      setError(
        "Your definitions are paused for local profile deletion. Reopen LEXIS after removal completes.",
      );
      setReady(true);
    });
    return () => {
      active = false;
      window.removeEventListener("storage", changed);
      release();
    };
  }, [reload]);
  const writable = useCallback(() => {
    if (paused.current || !current.current)
      throw new Error(
        "Open or recover your personal dictionary before making changes. The original data is preserved.",
      );
    assertLocalWritesAllowed(window.localStorage);
    const latest = new BrowserUserLexicalRepository(window.localStorage).read();
    if (latest.serialized !== current.current.serialized)
      throw new Error(
        "Your personal dictionary changed in another tab. Reload it before saving again.",
      );
    return current.current;
  }, []);
  const commit = useCallback(
    (next: UserLexicalCatalog, expected: string | null) => {
      try {
        writable();
        const serialized = new BrowserUserLexicalRepository(
          window.localStorage,
        ).commit(next, expected);
        current.current = { state: next, serialized };
        setState(next);
        setError("");
      } catch (cause) {
        setError(message(cause));
        throw cause;
      }
    },
    [writable],
  );
  const create = useCallback(
    (input: UserLexicalDraft): UserMeaningCreation | null => {
      try {
        const before = writable();
        const entry = createUserLexicalEntry({
          ...input,
          lexemeId: `user-lexeme-${crypto.randomUUID()}`,
          senseId: `user-sense-${crypto.randomUUID()}`,
          at: new Date().toISOString(),
        });
        const duplicate = findDuplicateUserLexicalSense(before.state, entry);
        if (duplicate) {
          setError("");
          return {
            entry: duplicate.entry,
            senseId: duplicate.senseId,
            added: false,
          };
        }
        commit(addUserLexicalEntry(before.state, entry), before.serialized);
        return { entry, senseId: entry.senses[0].id, added: true };
      } catch (cause) {
        setError(message(cause));
        return null;
      }
    },
    [commit, writable],
  );
  const addSense = useCallback(
    (lexemeId: string, input: UserSenseDraft): UserMeaningCreation | null => {
      try {
        const before = writable();
        const id = `user-sense-${crypto.randomUUID()}`;
        const next = appendUserLexicalSense(before.state, lexemeId, {
          ...input,
          id,
        });
        const entry = next.entries.find((item) => item.lexeme.id === lexemeId)!;
        const sense =
          entry.senses.find((item) => item.id === id) ??
          entry.senses.find(
            (item) =>
              item.definition === input.definition.trim() &&
              item.translation === (input.translation?.trim() ?? "") &&
              item.example === (input.example?.trim() ?? "") &&
              JSON.stringify(item.collocations) ===
                JSON.stringify(
                  input.collocations?.map((value) => value.trim()) ?? [],
                ),
          );
        if (!sense)
          throw new Error(
            "The original meaning could not be identified. No history has been reassigned.",
          );
        const added = next.revision !== before.state.revision;
        if (added) commit(next, before.serialized);
        else setError("");
        return { entry, senseId: sense.id, added };
      } catch (cause) {
        setError(message(cause));
        return null;
      }
    },
    [commit, writable],
  );
  const entries = useMemo(
    () => [...seedEntries, ...state.entries],
    [state.entries],
  );
  const lookup = useMemo(
    () => new LocalCatalogDictionaryLookup(entries),
    [entries],
  );
  const exactIndex = useMemo(
    () => buildLocalCatalogExactIndex(entries),
    [entries],
  );
  const matchingEntries = useCallback(
    (query: string) => exactIndex.get(normalizeLookupQuery(query)) ?? [],
    [exactIndex],
  );
  const findEntry = useCallback(
    (query: string, selectedSenseId?: string) => {
      const matches = matchingEntries(query);
      if (selectedSenseId)
        return (
          matches.find((entry) =>
            entry.senses.some((sense) => sense.id === selectedSenseId),
          ) ?? null
        );
      return matches.length === 1 ? matches[0] : null;
    },
    [matchingEntries],
  );
  const sensesById = useMemo(
    () =>
      new Map(
        entries.flatMap((entry) =>
          entry.senses.map((sense) => [sense.id, { entry, sense }] as const),
        ),
      ),
    [entries],
  );
  const findSense = useCallback(
    (id: string) => sensesById.get(id) ?? null,
    [sensesById],
  );
  const value = useMemo(
    () => ({
      entries,
      userEntries: state.entries,
      ready,
      error,
      lookup,
      findEntry,
      matchingEntries,
      findSense,
      reload,
      snapshot: () => current.current,
      commit,
      create,
      addSense,
    }),
    [
      entries,
      state.entries,
      ready,
      error,
      lookup,
      findEntry,
      matchingEntries,
      findSense,
      reload,
      commit,
      create,
      addSense,
    ],
  );
  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}
export function useLexicalCatalog(): CatalogValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error("LexicalCatalogProvider is required.");
  return value;
}
