"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import {
  emptyUserLexicalCatalog,
  parseUserLexicalCatalog,
  previewUserLexicalRestore,
  USER_LEXICAL_PARTS_OF_SPEECH,
  type UserLexicalEntry,
} from "@/domain/lexical-catalog";
import {
  USER_LEXICAL_CATALOG_KEY,
  USER_LEXICAL_CATALOG_LIMIT,
} from "@/infrastructure/storage/browser-lexical-catalog";
import { buildDictionaryHref } from "@/infrastructure/dictionary/context-navigation";
import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";
import {
  useLexicalCatalog,
  type UserLexicalDraft,
} from "./lexical-catalog-provider";
import { downloadLocalJson } from "./materials/use-materials";
import { Shell } from "./shell";
import styles from "./materials/materials.module.css";

interface CreatedMeaning {
  entry: UserLexicalEntry;
  senseId: string;
  added: boolean;
}

export function LexicalCatalogEditor({
  initial,
  onCreated,
}: {
  initial?: Partial<UserLexicalDraft>;
  onCreated?: (result: CreatedMeaning) => void;
}) {
  const catalog = useLexicalCatalog();
  const id = useId();
  const [lemma, setLemma] = useState(initial?.lemma ?? "");
  const [partOfSpeech, setPartOfSpeech] = useState(
    initial?.partOfSpeech ?? "noun",
  );
  const [definition, setDefinition] = useState(initial?.definition ?? "");
  const [translation, setTranslation] = useState(initial?.translation ?? "");
  const [example, setExample] = useState(initial?.example ?? "");
  const [ipa, setIpa] = useState(initial?.ipa ?? "");
  const [forms, setForms] = useState(initial?.forms?.join(", ") ?? "");
  const [lexemeId, setLexemeId] = useState("");
  const [created, setCreated] = useState<CreatedMeaning | null>(null);
  const target = catalog.userEntries.find(
    (entry) => entry.lexeme.id === lexemeId,
  );
  return (
    <form
      className={styles.stack}
      aria-label="Describe your own meaning"
      onSubmit={(event) => {
        event.preventDefault();
        setCreated(null);
        const sense = { definition, translation, example };
        const result = lexemeId
          ? catalog.addSense(lexemeId, sense)
          : catalog.create({
              ...sense,
              lemma,
              partOfSpeech,
              ipa,
              forms: forms
                .split(",")
                .map((form) => form.trim())
                .filter(Boolean),
            });
        if (result) {
          setCreated(result);
          onCreated?.(result);
        }
      }}
    >
      <p className={styles.small}>
        Your definition stays private on this device and is labelled as
        user-authored, without dictionary or AI verification. Creating it does
        not save a study intention or record knowledge.
      </p>
      <label className={styles.label} htmlFor={`${id}-target`}>
        Meaning belongs to
        <select
          id={`${id}-target`}
          className={styles.select}
          value={lexemeId}
          onChange={(event) => {
            setLexemeId(event.target.value);
            setCreated(null);
          }}
        >
          <option value="">A new word or separate part of speech</option>
          {catalog.userEntries.map((entry) => (
            <option value={entry.lexeme.id} key={entry.lexeme.id}>
              Another meaning of {entry.lexeme.lemma} ·{" "}
              {entry.lexeme.partOfSpeech} —{" "}
              {entry.senses[0].definition.slice(0, 80)}
            </option>
          ))}
        </select>
      </label>
      {lexemeId ? (
        <p className={styles.small}>
          This will add an independent meaning to {target?.lexeme.lemma} (
          {target?.lexeme.partOfSpeech}). Existing meanings and their practice
          history stay unchanged.
        </p>
      ) : (
        <>
          <label className={styles.label} htmlFor={`${id}-lemma`}>
            English word or expression
            <input
              id={`${id}-lemma`}
              className={styles.input}
              value={lemma}
              required
              maxLength={160}
              autoComplete="off"
              onChange={(event) => setLemma(event.target.value)}
            />
          </label>
          <label className={styles.label} htmlFor={`${id}-pos`}>
            Part of speech
            <select
              id={`${id}-pos`}
              className={styles.select}
              value={partOfSpeech}
              onChange={(event) => {
                const part = USER_LEXICAL_PARTS_OF_SPEECH.find(
                  (value) => value === event.target.value,
                );
                if (part) setPartOfSpeech(part);
              }}
            >
              {USER_LEXICAL_PARTS_OF_SPEECH.map((part) => (
                <option value={part} key={part}>
                  {part}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className={styles.label} htmlFor={`${id}-definition`}>
        Your English definition of this meaning
        <textarea
          id={`${id}-definition`}
          className={styles.textarea}
          required
          maxLength={2_000}
          value={definition}
          onChange={(event) => setDefinition(event.target.value)}
        />
      </label>
      <details>
        <summary>Translation, example and optional details</summary>
        <div className={styles.stack}>
          <label className={styles.label} htmlFor={`${id}-translation`}>
            Translation or explanation in Russian (optional)
            <input
              id={`${id}-translation`}
              className={styles.input}
              maxLength={1_000}
              value={translation}
              onChange={(event) => setTranslation(event.target.value)}
            />
          </label>
          <label className={styles.label} htmlFor={`${id}-example`}>
            Your example in English (optional)
            <textarea
              id={`${id}-example`}
              className={styles.textarea}
              maxLength={2_000}
              value={example}
              onChange={(event) => setExample(event.target.value)}
            />
          </label>
          {!lexemeId && (
            <>
              <label className={styles.label} htmlFor={`${id}-ipa`}>
                Your IPA transcription (optional, unverified)
                <input
                  id={`${id}-ipa`}
                  className={styles.input}
                  maxLength={160}
                  value={ipa}
                  onChange={(event) => setIpa(event.target.value)}
                />
              </label>
              <label className={styles.label} htmlFor={`${id}-forms`}>
                Explicit word forms (optional, separated by commas)
                <input
                  id={`${id}-forms`}
                  className={styles.input}
                  maxLength={6_400}
                  value={forms}
                  onChange={(event) => setForms(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
      </details>
      {catalog.error && (
        <div>
          <p role="alert">{catalog.error}</p>
          <button
            className="button ghost"
            type="button"
            onClick={catalog.reload}
          >
            Reload own dictionary before retrying
          </button>
        </div>
      )}
      <button
        className="button secondary"
        type="submit"
        disabled={
          !catalog.ready || !definition.trim() || (!lexemeId && !lemma.trim())
        }
      >
        Create user-authored meaning
      </button>
      {created && (
        <div role="status">
          <p>
            {created.added
              ? "Your meaning was created on this device."
              : "This exact meaning already exists; its original identity was kept."}{" "}
            No learning evidence or review was created.
          </p>
          <Link
            className="text-link"
            href={buildDictionaryHref({
              query: created.entry.lexeme.lemma,
              senseId: created.senseId,
              returnHref: "/library/meanings",
            })}
          >
            Open this meaning in Dictionary
          </Link>
        </div>
      )}
    </form>
  );
}

function UserLexicalBackup() {
  const catalog = useLexicalCatalog();
  const requestId = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{
    result: ReturnType<typeof previewUserLexicalRestore>;
    expected: string | null;
  } | null>(null);
  return (
    <details>
      <summary>Own dictionary backup and recovery</summary>
      <section className={styles.stack} aria-label="Own dictionary backup">
        <p className={styles.small}>
          This backup contains your definitions and their stable IDs. Export
          learning history, saved passages and materials separately. Existing
          IDs and history are never replaced by a conflicting definition.
        </p>
        <div className={styles.actions}>
          <button
            className="button secondary"
            disabled={!catalog.ready}
            onClick={() => {
              try {
                downloadLocalJson(
                  "lexis-own-dictionary-v1.json",
                  localStorage.getItem(USER_LEXICAL_CATALOG_KEY) ??
                    JSON.stringify(emptyUserLexicalCatalog()),
                );
              } catch {
                setError(
                  "The original dictionary bytes could not be exported. Nothing was changed.",
                );
              }
            }}
          >
            Export own dictionary / original
          </button>
          <button className="button ghost" onClick={catalog.reload}>
            Reload own dictionary
          </button>
        </div>
        <label className={styles.label}>
          Own dictionary backup
          <input
            type="file"
            className={styles.file}
            accept=".json,application/json"
            aria-label="Choose own dictionary backup"
            onChange={async (event) => {
              const request = ++requestId.current;
              const file = event.target.files?.[0];
              setPreview(null);
              setError("");
              setNotice("");
              if (!file) return;
              try {
                if (file.size > USER_LEXICAL_CATALOG_LIMIT * 3)
                  throw new Error(
                    "This backup exceeds the own dictionary size limit.",
                  );
                const text = await file.text();
                if (request !== requestId.current) return;
                assertLocalWritesAllowed(window.localStorage);
                if (text.length > USER_LEXICAL_CATALOG_LIMIT)
                  throw new Error(
                    "This backup exceeds the own dictionary size limit.",
                  );
                const current = catalog.snapshot();
                if (!current)
                  throw new Error(
                    "Recover the current dictionary before merging a backup. Its original bytes are preserved.",
                  );
                const result = previewUserLexicalRestore(
                  current.state,
                  parseUserLexicalCatalog(JSON.parse(text)),
                );
                setPreview({ result, expected: current.serialized });
              } catch (cause) {
                if (request === requestId.current)
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "This dictionary backup could not be opened. Nothing was changed.",
                  );
              }
            }}
          />
        </label>
        {preview && (
          <div>
            <p>
              {preview.result.entriesToAdd} new entries ·{" "}
              {preview.result.sensesToAdd} new meanings ·{" "}
              {preview.result.unchangedEntries} unchanged entries.
            </p>
            {!!preview.result.conflicts.length && (
              <div role="alert">
                <p>
                  Conflicting identities prevent this merge. Existing data is
                  unchanged.
                </p>
                <ul>
                  {preview.result.conflicts.map((conflict, index) => (
                    <li key={index}>{conflict}</li>
                  ))}
                </ul>
              </div>
            )}
            <button
              className="button secondary"
              disabled={!preview.result.merged}
              onClick={() => {
                if (!preview.result.merged) return;
                try {
                  catalog.commit(preview.result.merged, preview.expected);
                  setPreview(null);
                  setNotice(
                    "Own dictionary merged on this device. IDs and existing learning history are preserved.",
                  );
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "This merge could not be saved. Existing data is unchanged.",
                  );
                }
              }}
            >
              Confirm own dictionary merge
            </button>
          </div>
        )}
        {(error || catalog.error) && (
          <p role="alert">{error || catalog.error}</p>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
    </details>
  );
}

export function UserMeaningsWorkspace({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const catalog = useLexicalCatalog();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const entries = catalog.userEntries.filter((entry) =>
    [
      entry.lexeme.lemma,
      entry.lexeme.partOfSpeech,
      ...entry.forms,
      ...entry.senses.flatMap((sense) => [sense.definition, sense.translation]),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <Shell title="Own dictionary">
      <header className={styles.header}>
        <p className="eyebrow">YOUR WORDS, PRECISE MEANINGS</p>
        <h1>Own dictionary</h1>
        <p className="intro-copy">
          Describe the meaning you want to study. Each meaning keeps its own
          learning history.
        </p>
        <Link className="text-link" href="/library">
          Back to Library
        </Link>
      </header>
      <div className={styles.stack}>
        <section className={`glass-panel ${styles.panel}`}>
          <h2>Add a meaning</h2>
          <LexicalCatalogEditor initial={{ lemma: initialQuery }} />
        </section>
        <section
          className={`glass-panel ${styles.panel}`}
          aria-label="User-authored entries"
        >
          <h2>Your entries</h2>
          <label className={styles.label}>
            Search your own dictionary
            <input
              className={styles.input}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(30);
              }}
            />
          </label>
          {!catalog.ready ? (
            <p role="status">Opening your own dictionary…</p>
          ) : (
            <p className={styles.small}>
              {entries.length} matching entries. Definitions are user-authored,
              not verified dictionary facts.
            </p>
          )}
          {catalog.error && <p role="alert">{catalog.error}</p>}
          {catalog.ready && !entries.length && !catalog.error && (
            <p>
              No entries in this view. Add a meaning above or change your
              search.
            </p>
          )}
          <ul className={styles.list}>
            {entries.slice(0, limit).map((entry) => (
              <li className={styles.entry} key={entry.lexeme.id}>
                <h3>
                  {entry.lexeme.lemma}{" "}
                  <span className={styles.small}>
                    · {entry.lexeme.partOfSpeech}
                  </span>
                </h3>
                <p className={styles.small}>
                  User-authored · {entry.senses.length} independent{" "}
                  {entry.senses.length === 1 ? "meaning" : "meanings"}
                </p>
                <ul>
                  {entry.senses.map((sense) => (
                    <li key={sense.id}>
                      <Link
                        className="text-link"
                        href={buildDictionaryHref({
                          query: entry.lexeme.lemma,
                          senseId: sense.id,
                          returnHref: "/library/meanings",
                        })}
                      >
                        {sense.definition}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {entries.length > limit && (
            <button
              className="button secondary"
              onClick={() => setLimit((value) => value + 30)}
            >
              Show more entries
            </button>
          )}
        </section>
        <UserLexicalBackup />
      </div>
    </Shell>
  );
}
