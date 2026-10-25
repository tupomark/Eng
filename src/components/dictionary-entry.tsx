"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type {
  DictionaryContentSource,
  LookupDictionaryEntry,
} from "@/application/dictionary-lookup";
import {
  EDITORIAL_DEPTH_SOURCE,
  EDITORIAL_SENSE_DEPTH,
} from "@/infrastructure/dictionary/editorial-depth";
import { useLearning } from "./learning-provider";
import styles from "./dictionary-workspace.module.css";
import {
  senseContextIdentity,
  type SenseContextSource,
} from "@/domain/sense-contexts";
import { SavedPassageList, useSenseContexts } from "./sense-contexts";

export function DictionaryProvenance({
  source,
  label,
}: {
  source: DictionaryContentSource;
  label: string;
}) {
  return (
    <details className={styles.provenance}>
      <summary>
        {label} ·{" "}
        {source.kind === "ai-suggestion"
          ? "Unverified AI suggestion"
          : source.kind === "licensed"
            ? "Licensed source"
            : source.kind === "user-authored"
              ? "Your definition · not independently verified"
              : "Authored editorial sample"}
      </summary>
      <p>
        {source.provider} · {source.version}
      </p>
      <p>{source.rights}</p>
    </details>
  );
}

export function DictionarySenseList({
  entry,
  selectedSenseId,
  onSelect,
}: {
  entry: LookupDictionaryEntry;
  selectedSenseId: string;
  onSelect: (id: string) => void;
}) {
  const groups = new Map<string, typeof entry.senses>();
  for (const sense of entry.senses) {
    const part =
      EDITORIAL_SENSE_DEPTH[sense.id]?.partOfSpeech ??
      entry.lexeme.partOfSpeech;
    groups.set(part, [...(groups.get(part) ?? []), sense]);
  }
  return (
    <fieldset className={styles.senses}>
      <legend>
        {entry.senses.length > 1
          ? "Choose a meaning; each keeps its own history"
          : "Select this meaning"}
      </legend>
      {Array.from(groups, ([part, senses]) => (
        <div key={part} className={styles.senseGroup}>
          <h2>{part}</h2>
          {senses.map((sense) => (
            <label className={styles.sense} key={sense.id}>
              <input
                type="radio"
                name="full-dictionary-sense"
                value={sense.id}
                checked={selectedSenseId === sense.id}
                onChange={() => onSelect(sense.id)}
              />
              <span>
                <strong>{sense.definition}</strong>
                <span lang="ru">{sense.translation}</span>
              </span>
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}

export function DictionarySelectedMeaning({
  entry,
  selectedSenseId,
  level,
  context,
  surface,
  source,
  onSelect,
}: {
  entry: LookupDictionaryEntry;
  selectedSenseId: string;
  level: "full" | "deep";
  context: string;
  surface: string;
  source?: SenseContextSource;
  onSelect: (id: string) => void;
}) {
  const { state, ready, error, save, undoSave, canUndoSave } = useLearning();
  const [freshSavedId, setFreshSavedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const passages = useSenseContexts();
  const [freshContextId, setFreshContextId] = useState<string | null>(null);
  const sense = entry.senses.find((item) => item.id === selectedSenseId);
  if (!sense)
    return (
      <p className={styles.note}>
        Choose the meaning you intend to study. A shared spelling does not imply
        shared knowledge.
      </p>
    );
  const depth =
    entry.provenance.kind === "editorial"
      ? EDITORIAL_SENSE_DEPTH[sense.id]
      : undefined;
  const alreadySaved = state.saved.some((item) => item.senseId === sense.id);
  const contextInput = {
    senseId: sense.id,
    surface,
    excerpt: context,
    ...(source ? { source } : {}),
  };
  const currentContextSaved =
    !!context.trim() &&
    passages.state.contexts.some(
      (item) =>
        senseContextIdentity(item) === senseContextIdentity(contextInput),
    );
  const savedPassages = passages.state.contexts.filter(
    (item) => item.senseId === sense.id,
  );
  return (
    <section className={styles.detail} aria-label="Selected meaning details">
      <h2>{level === "deep" ? "Deep Dive" : "A closer look"}</h2>
      <p>{sense.definition}</p>
      <section
        className={styles.block}
        aria-label={
          entry.provenance.kind === "user-authored"
            ? "Your example"
            : "Editorial example"
        }
      >
        <h3>Example</h3>
        <p lang="en">
          {sense.example || "No example has been supplied for this meaning."}
        </p>
      </section>
      <section className={styles.block} aria-label="Collocations">
        <h3>Common combinations</h3>
        {!sense.collocations.length && (
          <p className={styles.note}>
            No combinations have been supplied by this source.
          </p>
        )}
        <ul>
          {sense.collocations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <DictionaryProvenance
        source={entry.provenance}
        label="Definitions, translation, IPA, example and combinations"
      />
      {depth && (
        <>
          <section className={styles.block}>
            <h3>Pattern &amp; register</h3>
            <p>{depth.pattern}</p>
            <p className="muted">{depth.register}</p>
          </section>
          {level === "deep" && (
            <>
              <section className={styles.block}>
                <h3>Meaning in use</h3>
                <p>{depth.usage}</p>
              </section>
              <details className={styles.explain}>
                <summary>Explain differently</summary>
                <p>{depth.simpler}</p>
                <p lang="ru">{depth.russian}</p>
              </details>
              {depth.contrast && (
                <section className={styles.block}>
                  <h3>A useful distinction</h3>
                  <p>{depth.contrast.explanation}</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      onSelect(depth.contrast!.senseId);
                      setNotice("");
                    }}
                  >
                    Explore the other meaning <ArrowRight size={16} />
                  </button>
                </section>
              )}
              <section className={styles.block}>
                <h3>Try a new context</h3>
                <p>{depth.practicePrompt}</p>
                <p className={styles.note}>
                  A practice prompt is not an assessment. No writing or speaking
                  evidence is recorded by reading these notes.
                </p>
              </section>
            </>
          )}
          <DictionaryProvenance
            source={EDITORIAL_DEPTH_SOURCE}
            label="Usage, register, explanations and prompts"
          />
        </>
      )}
      <section className={styles.block} aria-label="Pronunciation source">
        <h3>Pronunciation</h3>
        <p>{entry.lexeme.ipa || "No IPA has been supplied by this source."}</p>
        <p className={styles.note}>
          IPA is supplied by the displayed source. Verified BrE/AmE recordings
          and a pronunciation scorer are not connected. No audio is played.
        </p>
      </section>
      {entry.provenance.kind === "user-authored" && (
        <p className={styles.note}>
          This meaning was written by you. Practice can check recall of your
          definition; it does not independently verify its linguistic accuracy.
          Editorial Deep Dive and verified audio are not available for this
          entry.
        </p>
      )}
      <div className={styles.actions}>
        {passages.error && (
          <p className="status-banner error" role="alert">
            {passages.error}
          </p>
        )}
        {error && (
          <p className="status-banner error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={
            !ready ||
            (alreadySaved && (!context.trim() || currentContextSaved)) ||
            (!!context.trim() && (!passages.ready || !!passages.error))
          }
          onClick={() => {
            if (alreadySaved) {
              if (passages.save(contextInput))
                setNotice(
                  "Source context saved on this device. Original learning history was not changed.",
                );
              return;
            }
            if (save(sense.id, context)) {
              setFreshSavedId(sense.id);
              const passage = context.trim()
                ? passages.save(contextInput)
                : null;
              if (passage?.added) setFreshContextId(passage.id);
              setNotice(
                context.trim() && !passage
                  ? "Meaning saved on this device, but the separate source passage could not be saved. Keep a copy and retry; no knowledge was recorded."
                  : "Meaning saved on this device. Saving shows learning intent, not knowledge.",
              );
            }
          }}
        >
          {alreadySaved ? (
            <>
              <Check size={16} />{" "}
              {context.trim()
                ? currentContextSaved
                  ? "Source context saved"
                  : "Save this source context"
                : "Already in your collection"}
            </>
          ) : (
            <>
              Save selected meaning <ArrowRight size={16} />
            </>
          )}
        </button>
        {alreadySaved && (
          <Link className="button secondary" href="/learn">
            Open Smart Review <ArrowRight size={16} />
          </Link>
        )}
        {alreadySaved && (
          <Link
            className="button secondary"
            href={`/learn/practice?sense=${encodeURIComponent(sense.id)}`}
          >
            Practise this meaning <ArrowRight size={16} />
          </Link>
        )}
        {freshSavedId === sense.id && alreadySaved && canUndoSave(sense.id) && (
          <button
            className="button ghost"
            onClick={() => {
              if (undoSave(sense.id)) {
                setFreshSavedId(null);
                const removed = freshContextId
                  ? passages.remove(freshContextId)
                  : true;
                setFreshContextId(null);
                setNotice(
                  removed
                    ? "This fresh save was undone. Existing history was preserved."
                    : "The learning intent was undone; its separate passage could not be removed. Existing history was preserved. Retry passage removal below.",
                );
              }
            }}
          >
            Undo this save
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
        {!context && (
          <p className={styles.note}>
            No source passage is attached. Saving keeps this meaning without
            inventing a reading encounter.
          </p>
        )}
      </div>
      <SavedPassageList items={savedPassages} />
      {!!savedPassages.length && (
        <details>
          <summary>Manage this meaning’s saved passages</summary>
          <p className={styles.note}>
            Removing an additional source record does not remove the original
            excerpt in learning history, the meaning or practice evidence.
            Deleting a book keeps deliberately saved learning excerpts. Use
            Settings for confirmed removal of the complete local profile.
          </p>
          {savedPassages.map((item) => (
            <div key={item.id}>
              <blockquote>{item.excerpt}</blockquote>
              <button
                className="button ghost"
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove this additional source record? The original learning excerpt, meaning and evidence are kept. Complete local profile removal is available in Settings.",
                    )
                  )
                    passages.remove(item.id);
                }}
              >
                Remove this saved passage
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
