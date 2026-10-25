"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Shell } from "./shell";
import { useLearning } from "./learning-provider";
import {
  RELATION_TYPES,
  relationLabel,
  senseConnections,
  type RelationType,
} from "@/domain/knowledge/network";
import { EDITORIAL_RELATIONS } from "@/infrastructure/dictionary/editorial-relations";
import { useLexicalCatalog } from "./lexical-catalog-provider";
import { buildDictionaryHref } from "@/infrastructure/dictionary/context-navigation";
import styles from "./knowledge-workspaces.module.css";

export function SemanticNetwork({
  initialSense = "linger-stay",
  initialType = "all",
  initialSource = "all",
  initialSaved = false,
}: {
  initialSense?: string;
  initialType?: string;
  initialSource?: string;
  initialSaved?: boolean;
}) {
  const learning = useLearning();
  const catalog = useLexicalCatalog();
  const meanings = useMemo(
    () =>
      catalog.entries.flatMap((entry) =>
        entry.senses.map((sense) => ({
          sense,
          lexeme: entry.lexeme,
          provenance: entry.provenance,
        })),
      ),
    [catalog.entries],
  );
  const meaningById = useMemo(
    () => new Map(meanings.map((meaning) => [meaning.sense.id, meaning])),
    [meanings],
  );
  const router = useRouter();
  const selected = meaningById.get(initialSense) ?? meanings[0];
  const [type, setType] = useState(
    RELATION_TYPES.includes(initialType as RelationType) ? initialType : "all",
  );
  const [source, setSource] = useState(
    initialSource === "editorial" ||
      initialSource === "user" ||
      initialSource === "ai"
      ? initialSource
      : "all",
  );
  const [savedOnly, setSavedOnly] = useState(initialSaved);
  if (!catalog.ready)
    return (
      <Shell title="Semantic Network">
        <p role="status">Opening your local meanings…</p>
      </Shell>
    );
  if (initialSense && !meaningById.has(initialSense))
    return (
      <Shell title="Semantic Network">
        <div className={styles.workspace}>
          <header className={styles.header}>
            <p className="eyebrow">SEMANTIC NETWORK</p>
            <h1>Meaning unavailable.</h1>
            <p>
              The requested meaning is unavailable in this local dictionary. Its
              saved context and history have not been changed or attached to
              another meaning.
            </p>
            <div className={styles.links}>
              <Link className="button secondary" href="/library">
                Return to Library
              </Link>
              <Link className="text-link" href="/core/network">
                Explore the editorial sample
              </Link>
            </div>
          </header>
        </div>
      </Shell>
    );
  const savedIds = learning.state.saved.map((saved) => saved.senseId);
  const edges = senseConnections(EDITORIAL_RELATIONS, selected.sense.id, {
    ...(type === "all" ? {} : { type: type as RelationType }),
    ...(source === "all"
      ? {}
      : { source: source as "editorial" | "user" | "ai" }),
    ...(savedOnly ? { savedSenseIds: savedIds } : {}),
  });
  function networkHref(senseId: string) {
    const query = new URLSearchParams({ sense: senseId, type, source });
    if (savedOnly) query.set("saved", "1");
    return `/core/network?${query.toString()}`;
  }
  const returnHref = networkHref(selected.sense.id);
  const selectedSaved = learning.state.saved.find(
    (saved) => saved.senseId === selected.sense.id,
  );
  return (
    <Shell title="Semantic Network">
      <div className={styles.workspace}>
        <header className={styles.header}>
          <p className="eyebrow">SEMANTIC NETWORK</p>
          <h1>
            Connections,
            <br />
            <span>with a reason.</span>
          </h1>
          <p>
            A small, readable neighbourhood of meanings. Every connection says
            what it means and where it came from.
          </p>
          <div className={styles.links}>
            <Link className="text-link" href="/core">
              Back to Core
            </Link>
            <Link className="text-link" href="/core/observatory">
              Knowledge Observatory
            </Link>
          </div>
        </header>
        <section
          className={`${styles.panel} glass-panel`}
          aria-label="Choose a meaning"
        >
          <h2>Start with one meaning</h2>
          <label className={styles.field}>
            Editorial or own meaning
            <select
              value={selected.sense.id}
              onChange={(event) => {
                router.push(networkHref(event.target.value));
              }}
            >
              {meanings.map(({ lexeme, sense }) => (
                <option key={sense.id} value={sense.id}>
                  {lexeme.lemma} — {sense.translation || sense.definition}
                </option>
              ))}
            </select>
          </label>
          <h3>
            {selected.lexeme.lemma}{" "}
            <span className={styles.meta}>{selected.lexeme.partOfSpeech}</span>
          </h3>
          <p>{selected.sense.definition}</p>
          <p className={styles.note}>{selected.sense.translation}</p>
          {selected.provenance.kind === "user-authored" && (
            <p className={styles.note}>
              Your own note · not independently verified. Connections are shown
              only when an explicit warranted link exists.
            </p>
          )}
          {selectedSaved ? (
            <>
              <span className={styles.badge}>In your Library</span>
              {selectedSaved.context && (
                <blockquote className={styles.quote}>
                  {selectedSaved.context}
                </blockquote>
              )}
            </>
          ) : (
            <p className={styles.note}>
              This meaning is dictionary information; it is not automatically
              part of your learning history.
            </p>
          )}
          <div className={styles.links}>
            <Link
              className="text-link"
              href={buildDictionaryHref({
                query: selected.lexeme.lemma,
                lexemeId: selected.lexeme.id,
                senseId: selected.sense.id,
                level: "full",
                returnHref,
              })}
            >
              Open Dictionary entry
            </Link>
            <Link
              className="text-link"
              href={`/learn/practice?sense=${encodeURIComponent(selected.sense.id)}`}
            >
              Practice this meaning
            </Link>
          </div>
        </section>
        <section className={`${styles.panel} glass-panel`}>
          <h2>Connected meanings</h2>
          <div className={styles.filters}>
            <label className={styles.field}>
              Connection type
              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="all">All connection types</option>
                {RELATION_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {relationLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Source
              <select
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                <option value="all">All sources</option>
                <option value="editorial">LEXIS editorial sample</option>
                <option value="user">Your own links</option>
                <option value="ai">AI proposals</option>
              </select>
            </label>
          </div>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={savedOnly}
              onChange={(event) => setSavedOnly(event.target.checked)}
            />
            Connections touching a saved meaning
          </label>
          {edges.length ? (
            <ul className={styles.list} aria-label="Meaning connections">
              {edges.map((edge) => {
                const otherId =
                  edge.fromSenseId === selected.sense.id
                    ? edge.toSenseId
                    : edge.fromSenseId;
                const other = meaningById.get(otherId);
                if (!other) return null;
                return (
                  <li className={styles.row} key={edge.id}>
                    <span className={styles.badge}>
                      {relationLabel(edge.type)} ·{" "}
                      {edge.verification === "proposal"
                        ? "Unverified proposal"
                        : "Editorial teaching link"}
                    </span>
                    <h3>
                      {other.lexeme.lemma} — {other.sense.translation}
                    </h3>
                    <p>{other.sense.definition}</p>
                    <details>
                      <summary>Why this connection?</summary>
                      <p>{edge.explanation}</p>
                      <blockquote className={styles.quote}>
                        {edge.example}
                      </blockquote>
                      <p className={styles.meta}>
                        {edge.provenance.provider} · {edge.provenance.version} ·{" "}
                        {edge.provenance.rights}
                      </p>
                    </details>
                    <div className={styles.links}>
                      <Link className="text-link" href={networkHref(otherId)}>
                        Explore linked meaning
                      </Link>
                      <Link
                        className="text-link"
                        href={buildDictionaryHref({
                          query: other.lexeme.lemma,
                          lexemeId: other.lexeme.id,
                          senseId: otherId,
                          returnHref,
                        })}
                      >
                        Read linked Dictionary entry
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>
              <p>No warranted connections match these filters.</p>
              <p className={styles.note}>
                A missing link is not evidence that you do not know a word. This
                sample does not invent synonyms or personal relationships to
                fill the view.
              </p>
            </div>
          )}
          <p className={styles.note}>
            Coverage: eight authored words, ten meanings, four teaching links.
            No live lexical graph is connected. A connection in an example is
            labelled separately from synonymy, collocation frequency or a
            learner’s observed habit. The list is fully usable without a graph
            or dragging.
          </p>
        </section>
      </div>
    </Shell>
  );
}
