"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Search,
  BookOpen,
  Bookmark,
  ArrowRight,
} from "lucide-react";
import { seedEntries } from "@/infrastructure/dictionary/seed";
import { Shell } from "./shell";
import { useLearning } from "./learning-provider";

export function Library() {
  const { state, ready } = useLearning();
  const [query, setQuery] = useState("");
  const saved = state.saved.flatMap((item) => {
    const entry = seedEntries.find((entry) =>
      entry.senses.some((sense) => sense.id === item.senseId),
    );
    const sense = entry?.senses.find((sense) => sense.id === item.senseId);
    return entry &&
      sense &&
      `${entry.lexeme.lemma} ${sense.definition} ${sense.translation}`
        .toLowerCase()
        .includes(query.toLowerCase())
      ? [{ ...item, entry, sense }]
      : [];
  });
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
        {!ready ? (
          <p role="status">Opening your collection…</p>
        ) : saved.length ? (
          <div className="meaning-grid">
            {saved.map(({ sense, entry, context }) => (
              <article className="meaning-card glass-panel" key={sense.id}>
                <div>
                  <h3>{entry.lexeme.lemma}</h3>
                  <span className="tiny muted">
                    {entry.lexeme.ipa} · {entry.lexeme.partOfSpeech}
                  </span>
                </div>
                <p>{sense.definition}</p>
                <p className="translation" lang="ru">
                  {sense.translation}
                </p>
                <blockquote>{context}</blockquote>
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
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state glass-panel">
            <Bookmark size={28} strokeWidth={1.3} />
            <h2>
              {query
                ? "No meanings match yet."
                : "Your collection begins with curiosity."}
            </h2>
            <p>
              {query
                ? "Try a different word or definition."
                : "Open a reading, tap a word and choose the meaning that speaks to its context."}
            </p>
            {!query && (
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
