"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Search,
  BookOpen,
  Bookmark,
  ArrowRight,
} from "lucide-react";
import { useLexicalCatalog } from "./lexical-catalog-provider";
import { Shell } from "./shell";
import { useLearning } from "./learning-provider";
import { MaterialLibrary } from "./materials/material-library";
import { SavedPassageList, useSenseContexts } from "./sense-contexts";
import type { SavedSenseContext } from "@/domain/sense-contexts";

export function Library({ initialQuery = "" }: { initialQuery?: string }) {
  const { state, ready } = useLearning();
  const catalog = useLexicalCatalog();
  const [query, setQuery] = useState(initialQuery);
  const passages = useSenseContexts();
  const passageRecords = passages.state.contexts;
  const contextsBySense = useMemo(() => {
    const grouped = new Map<string, SavedSenseContext[]>();
    for (const item of passageRecords) {
      const list = grouped.get(item.senseId) ?? [];
      list.push(item);
      grouped.set(item.senseId, list);
    }
    return grouped;
  }, [passageRecords]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const saved = state.saved
    .map((item) => {
      const resolved = catalog.findSense(item.senseId);
      const entry = resolved?.entry;
      const sense = resolved?.sense;
      return { ...item, entry, sense };
    })
    .filter(({ senseId, context, entry, sense }) =>
      [
        senseId,
        context,
        entry?.lexeme.lemma,
        sense?.definition,
        sense?.translation,
        ...(contextsBySense.get(senseId) ?? []).map((item) => item.excerpt),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  return (
    <Shell title="Library">
      <div className="page-heading">
        <p className="eyebrow">YOUR PERSONAL CORPUS</p>
        <h1>
          A place for
          <br />
          <span>what stays with you.</span>
        </h1>
        <p className="intro-copy">
          Keep the meaning. Keep the moment you found it.
        </p>
      </div>
      <MaterialLibrary />
      <section className="library-reading glass-panel">
        <div className="library-book-mark">
          <BookOpen size={28} strokeWidth={1.3} />
        </div>
        <div>
          <p className="eyebrow">LEXIS READINGS · ORIGINAL TEXT</p>
          <h2>The art of noticing</h2>
          <p className="muted">Three small invitations to pay attention.</p>
        </div>
        <Link className="button secondary" href="/reader">
          Open Reader
          <ArrowUpRight size={16} />
        </Link>
      </section>
      <section>
        {passages.error && (
          <p role="alert">
            {passages.error} Original saved meanings remain below; recover
            separate passages in Dictionary.
          </p>
        )}
        {catalog.error && <p role="alert">{catalog.error}</p>}
        <div className="section-heading library-heading">
          <h2>
            Your meanings{" "}
            <span className="count-label">{state.saved.length}</span>
          </h2>
          <label className="search-field compact">
            <Search size={16} />
            <input
              placeholder="Find a meaning…"
              aria-label="Search saved meanings"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <p>
          <Link className="text-link" href="/library/meanings">
            Write a meaning from your own notes <ArrowUpRight size={14} />
          </Link>
        </p>
        {!ready || !passages.ready || !catalog.ready ? (
          <p role="status">Opening your collection…</p>
        ) : saved.length ? (
          <div className="meaning-grid">
            {saved.map(({ senseId, sense, entry, context, savedAt }) => (
              <article className="meaning-card glass-panel" key={senseId}>
                <div>
                  <h3>{entry?.lexeme.lemma ?? "Unavailable meaning"}</h3>
                  <span className="tiny muted">
                    {entry
                      ? `${entry.lexeme.ipa} · ${entry.lexeme.partOfSpeech}`
                      : `Saved ${new Date(savedAt).toLocaleDateString()}`}
                  </span>
                </div>
                {sense ? (
                  <>
                    {entry?.provenance.kind === "user-authored" && (
                      <p className="tiny muted">
                        Your own note · not independently verified
                      </p>
                    )}
                    <p>{sense.definition}</p>
                    <p className="translation" lang="ru">
                      {sense.translation}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="tiny muted">
                      Unavailable in this dictionary version
                    </p>
                    <p>
                      Your saved context and practice history are kept. This
                      meaning has not been replaced with another definition.
                    </p>
                    <p className="tiny muted">Meaning reference: {senseId}</p>
                  </>
                )}
                <blockquote>{context}</blockquote>
                <SavedPassageList items={contextsBySense.get(senseId) ?? []} />
                {sense && entry && (
                  <Link
                    className="text-link"
                    href={`/dictionary?q=${encodeURIComponent(entry.lexeme.lemma)}&sense=${encodeURIComponent(senseId)}`}
                  >
                    Open this meaning <ArrowUpRight size={14} />
                  </Link>
                )}
                {sense ? (
                  <details>
                    <summary>Explore this meaning</summary>
                    <p className="muted">{sense.example}</p>
                    <div className="collocations">
                      {sense.collocations.map((item) => (
                        <span className="pill" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </details>
                ) : (
                  <Link className="text-link" href="/core">
                    Open history &amp; data export
                    <ArrowUpRight size={14} />
                  </Link>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state glass-panel">
            <Bookmark size={28} strokeWidth={1.3} />
            <h2>
              {normalizedQuery
                ? "No meanings match yet."
                : "Your collection begins with curiosity."}
            </h2>
            <p>
              {normalizedQuery
                ? "Try a different word or definition."
                : "Open a reading, tap a word and choose the meaning that speaks to its context."}
            </p>
            {!normalizedQuery && (
              <Link className="button primary" href="/reader">
                Find your first meaning
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        )}
      </section>
    </Shell>
  );
}
