"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Search } from "lucide-react";
import type { DictionaryLookupResult } from "@/application/dictionary-lookup";
import { EditorialDictionaryLookup } from "@/infrastructure/dictionary/editorial-lookup";
import { findEntry } from "@/infrastructure/dictionary/seed";
import {
  buildDictionaryHref,
  loadDictionaryVisit,
  safeDictionaryReturnHref,
  type DictionaryVisitContext,
} from "@/infrastructure/dictionary/context-navigation";
import {
  DictionarySelectedMeaning,
  DictionarySenseList,
} from "./dictionary-entry";
import { Shell } from "./shell";
import styles from "./dictionary-workspace.module.css";

const dictionary = new EditorialDictionaryLookup();
export function DictionaryWorkspace({
  initialQuery = "",
  initialSenseId = "",
  initialLevel = "full",
  visitToken = "",
  returnHref = "/library",
}: {
  initialQuery?: string;
  initialSenseId?: string;
  initialLevel?: "full" | "deep";
  visitToken?: string;
  returnHref?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [selectedSenseId, setSelectedSenseId] = useState(initialSenseId);
  const [level, setLevel] = useState(initialLevel);
  const [context, setContext] = useState<DictionaryVisitContext | null>(null);
  const [contextError, setContextError] = useState("");
  const [response, setResponse] = useState<{
    query: string;
    result: DictionaryLookupResult;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const result = response?.query === query ? response.result : null;
  const entry =
    result?.status === "found" && result.matches.length === 1
      ? result.matches[0].entry
      : null;
  const match =
    result?.status === "found" && result.matches.length === 1
      ? result.matches[0]
      : null;
  let backHref = safeDictionaryReturnHref(context?.returnHref ?? returnHref);
  if (
    context &&
    entry &&
    findEntry(context.surface)?.lexeme.id === entry.lexeme.id &&
    entry.senses.some((sense) => sense.id === selectedSenseId)
  ) {
    const returnUrl = new URL(backHref, "https://lexis.invalid");
    if (
      returnUrl.pathname === "/reader" &&
      returnUrl.searchParams.has("dictionaryVisit")
    ) {
      returnUrl.searchParams.set("sense", selectedSenseId);
      backHref = returnUrl.pathname + returnUrl.search + returnUrl.hash;
    }
  }

  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => {
      if (!current || !visitToken) return;
      try {
        const saved = loadDictionaryVisit(visitToken);
        setContext(saved);
        if (!saved)
          setContextError(
            "The passage from this visit is no longer available in this tab. Your saved learning data has not been changed.",
          );
      } catch {
        setContextError(
          "The passage from this visit could not be opened. Your original reading and learning data have not been changed.",
        );
      }
    });
    return () => {
      current = false;
    };
  }, [visitToken]);
  useEffect(() => {
    const controller = new AbortController();
    void dictionary
      .lookup({ query, context: context?.excerpt, signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) setResponse({ query, result: next });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResponse({
            query,
            result: { status: "unavailable", reason: "provider-error" },
          });
      });
    return () => controller.abort();
  }, [query, context?.excerpt, retry]);

  function updateLocation(
    nextSense = selectedSenseId,
    nextLevel = level,
    nextQuery = query,
  ) {
    router.replace(
      buildDictionaryHref({
        query: nextQuery,
        senseId: nextSense || undefined,
        level: nextLevel,
        contextToken: visitToken || undefined,
        returnHref: backHref,
      }),
      { scroll: false },
    );
  }
  function selectSense(id: string) {
    setSelectedSenseId(id);
    updateLocation(id);
  }

  return (
    <Shell title="Dictionary">
      <div className={styles.workspace}>
        <Link className="text-link" href={backHref}>
          <ArrowLeft size={16} /> Return to your source
        </Link>
        <header className={styles.header}>
          <p className="eyebrow">
            INTELLIGENT DICTIONARY · LOCAL EDITORIAL SAMPLE
          </p>
          <h1>
            A meaning,
            <br />
            <span>in context.</span>
          </h1>
          <p className="intro-copy">
            Explore the available senses, then choose the one you intend to
            study.
          </p>
        </header>
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            updateLocation();
          }}
        >
          <label htmlFor="full-dictionary-query">
            Word, form, phrase or translation
          </label>
          <div>
            <Search size={18} />
            <input
              id="full-dictionary-query"
              type="search"
              autoComplete="off"
              maxLength={160}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedSenseId("");
              }}
            />
            <button className="button secondary" type="submit">
              Search
            </button>
          </div>
        </form>
        <p className={styles.note}>
          Eight authored entries are available offline. Live dictionary coverage
          and licensed audio are awaiting configuration; an absent result does
          not mean the word is invalid.
        </p>
        {contextError && (
          <p role="alert" className="status-banner error">
            {contextError}
          </p>
        )}
        {context && (
          <aside
            className={styles.context}
            aria-label="Original lookup context"
          >
            <p className="eyebrow">Your selected passage</p>
            <blockquote>{context.excerpt}</blockquote>
            {context.source && (
              <p className={styles.note}>
                Source version {context.source.documentVersion} · chapter{" "}
                {context.source.chapterId} · paragraph{" "}
                {context.source.paragraphIndex + 1}
              </p>
            )}
          </aside>
        )}
        {!result ? (
          <p role="status">Looking in the editorial sample…</p>
        ) : result.status === "found" && entry && match ? (
          <article className={styles.entry}>
            <header>
              <p className="eyebrow">
                FULL ENTRY ·{" "}
                {entry.provenance.kind === "ai-suggestion"
                  ? "UNVERIFIED AI SUGGESTION"
                  : entry.provenance.kind === "licensed"
                    ? "LICENSED SOURCE"
                    : "EDITORIAL SAMPLE"}
              </p>
              <h2 className={styles.headword}>{entry.lexeme.lemma}</h2>
              <p className={styles.ipa}>
                {entry.lexeme.ipa} · {entry.lexeme.partOfSpeech}
              </p>
              {match.matchedBy === "form" && (
                <p className={styles.note}>
                  Selected form: {query}. Headword: {entry.lexeme.lemma}. This
                  explicit form mapping does not choose a sense for you.
                </p>
              )}
              {match.forms.length > 0 && (
                <p className={styles.note}>
                  Editorial forms: {match.forms.join(", ")}
                </p>
              )}
            </header>
            <nav className={styles.tabs} aria-label="Dictionary detail level">
              {(["full", "deep"] as const).map((value) => (
                <button
                  key={value}
                  className={`button ${level === value ? "secondary" : "ghost"}`}
                  aria-pressed={level === value}
                  onClick={() => {
                    setLevel(value);
                    updateLocation(selectedSenseId, value);
                  }}
                >
                  {value === "full" ? "Full Entry" : "Deep Dive"}
                </button>
              ))}
            </nav>
            <DictionarySenseList
              entry={entry}
              selectedSenseId={selectedSenseId}
              onSelect={selectSense}
            />
            <DictionarySelectedMeaning
              key={`${entry.lexeme.id}:${selectedSenseId}`}
              entry={entry}
              selectedSenseId={selectedSenseId}
              level={level}
              context={context?.excerpt ?? ""}
              onSelect={selectSense}
            />
          </article>
        ) : result.status === "found" ? (
          <section
            className={styles.results}
            aria-label="Dictionary search results"
          >
            <h2>{query.trim() ? "Matching entries" : "Explore the sample"}</h2>
            {result.matches.map(({ entry: candidate }) => (
              <button
                className={styles.result}
                key={candidate.lexeme.id}
                onClick={() => {
                  setQuery(candidate.lexeme.lemma);
                  setSelectedSenseId("");
                  updateLocation("", level, candidate.lexeme.lemma);
                }}
              >
                <BookOpen size={19} />
                <span>
                  <strong>{candidate.lexeme.lemma}</strong>
                  <span>
                    {candidate.lexeme.partOfSpeech} · {candidate.senses.length}{" "}
                    {candidate.senses.length === 1 ? "meaning" : "meanings"}
                  </span>
                </span>
              </button>
            ))}
          </section>
        ) : result.status === "not-found" ? (
          <section className="empty-state glass-panel">
            <BookOpen size={26} />
            <h2>Outside this sample.</h2>
            <p>
              No entry for “{query}” was found in the eight-word editorial
              sample. Your passage and existing learning history are preserved.
            </p>
            <p className={styles.note}>
              Try a different form or a supported headword, such as linger or
              trace. A full live dictionary requires a configured, licensed
              source.
            </p>
            <Link href={backHref} className="button secondary">
              Return to your source
            </Link>
          </section>
        ) : (
          <section className="empty-state glass-panel">
            <h2>Dictionary search is unavailable.</h2>
            <p>
              No assessment or learning change was recorded. Your input and
              source remain available.
            </p>
            <button
              className="button secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try search again
            </button>
          </section>
        )}
      </div>
    </Shell>
  );
}
