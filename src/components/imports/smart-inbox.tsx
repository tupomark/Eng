"use client";
import Link from "next/link";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { useLearning } from "@/components/learning-provider";
import { useMaterials } from "@/components/materials/use-materials";
import { useLexicalCatalog } from "@/components/lexical-catalog-provider";
import { LexicalCatalogEditor } from "@/components/lexical-catalog-editor";
import { buildDictionaryHref } from "@/infrastructure/dictionary/context-navigation";
import { normalizeImportTerm } from "@/domain/imports/lexical-import";
import type { ImportDisposition, ImportRow } from "@/domain/imports/types";
import styles from "@/components/materials/materials.module.css";

const PAGE_SIZE = 30;
export function SmartInbox() {
  const materials = useMaterials();
  const learning = useLearning();
  const catalog = useLexicalCatalog();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ImportDisposition>("pending");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ term: "", translation: "", context: "" });
  const [senseChoices, setSenseChoices] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = materials.state.batches
    .filter((batch) => !batch.rolledBackAt)
    .flatMap((batch) =>
      batch.rows.map((row) => ({
        ...row,
        batchId: batch.id,
        batchName: batch.sourceName,
      })),
    )
    .filter(
      (row) =>
        (filter === "all" || row.disposition === filter) &&
        `${row.term} ${row.translation} ${row.context} ${row.source} ${row.batchName}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
  const visible = rows.slice(0, limit);
  function updateRows(ids: string[], change: (row: ImportRow) => ImportRow) {
    const chosen = new Set(ids);
    return materials.update((state) => ({
      ...state,
      revision: state.revision + 1,
      batches: state.batches.map((batch) => ({
        ...batch,
        rows: batch.rows.map((row) => (chosen.has(row.id) ? change(row) : row)),
      })),
    }));
  }
  function setDisposition(disposition: ImportDisposition, ids: string[]) {
    if (
      disposition === "accepted" &&
      rows.some(
        (row) => ids.includes(row.id) && (!row.term.trim() || row.error),
      )
    ) {
      setError("Repair missing words before accepting the selected rows.");
      return;
    }
    if (updateRows(ids, (row) => ({ ...row, disposition }))) {
      setSelected([]);
      setError(null);
      setNotice(
        disposition === "accepted"
          ? "Rows accepted as study intentions. Their meanings remain unresolved; no reviews were created."
          : `Rows ${disposition}. Learning history is unchanged.`,
      );
    }
  }
  return (
    <Shell title="Smart Inbox">
      <div className={styles.header}>
        <p className="eyebrow">YOUR NEXT INTENTIONS</p>
        <h1>A little at a time.</h1>
        <p className="intro-copy">
          Imports are material to explore, never a judgement of what you know.
        </p>
      </div>
      <div className={styles.stack}>
        <section className={`glass-panel ${styles.panel}`}>
          <div className={styles.actions}>
            <Link className="button secondary" href="/library/import">
              Import vocabulary
            </Link>
            <Link className="button ghost" href="/library">
              Back to Library
            </Link>
            <Link className="button ghost" href="/library/meanings">
              Own dictionary
            </Link>
          </div>
          <label className={styles.label}>
            Search imported vocabulary
            <input
              className={styles.input}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(PAGE_SIZE);
                setSelected([]);
              }}
            />
          </label>
          <label className={styles.label}>
            Show
            <select
              className={styles.select}
              aria-label="Show"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as typeof filter);
                setLimit(PAGE_SIZE);
                setSelected([]);
              }}
            >
              {["pending", "accepted", "deferred", "rejected", "all"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ),
              )}
            </select>
          </label>
          {!materials.ready ? (
            <p role="status">Opening Smart Inbox…</p>
          ) : (
            <p>
              {rows.length} matching {rows.length === 1 ? "row" : "rows"}.{" "}
              {
                materials.state.batches.filter((batch) => !batch.rolledBackAt)
                  .length
              }{" "}
              active batches.
            </p>
          )}
          {(materials.error || learning.error || catalog.error || error) && (
            <p className="status-banner error" role="alert">
              {error || materials.error || learning.error || catalog.error}
            </p>
          )}
          {visible.length > 0 && (
            <>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={visible.every((row) => selected.includes(row.id))}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked ? visible.map((row) => row.id) : [],
                    )
                  }
                />
                Select these {visible.length} rows
              </label>
              <div className={styles.actions}>
                <button
                  className="button secondary"
                  disabled={!selected.length}
                  onClick={() => setDisposition("accepted", selected)}
                >
                  Accept selected
                </button>
                <button
                  className="button ghost"
                  disabled={!selected.length}
                  onClick={() => setDisposition("deferred", selected)}
                >
                  Defer selected
                </button>
                <button
                  className="button ghost"
                  disabled={!selected.length}
                  onClick={() => setDisposition("rejected", selected)}
                >
                  Reject selected
                </button>
              </div>
            </>
          )}
          {!visible.length && materials.ready && (
            <p className={styles.small}>
              Nothing in this view. Change the filter or bring a vocabulary
              list.
            </p>
          )}
          <ul className={styles.list}>
            {visible.map((row) => {
              const entries = catalog.entries.filter(
                (candidate) =>
                  normalizeImportTerm(candidate.lexeme.lemma) ===
                    normalizeImportTerm(row.term) ||
                  catalog.userEntries.some(
                    (item) =>
                      item.lexeme.id === candidate.lexeme.id &&
                      item.forms.some(
                        (form) =>
                          normalizeImportTerm(form) ===
                          normalizeImportTerm(row.term),
                      ),
                  ) ||
                  candidate.senses.some((sense) => sense.id === row.senseId),
              );
              const meanings = entries.flatMap((entry) =>
                entry.senses.map((sense) => ({ entry, sense })),
              );
              const choice = senseChoices[row.id] ?? row.senseId ?? "";
              const saved =
                row.senseId !== null &&
                learning.state.saved.some(
                  (item) => item.senseId === row.senseId,
                );
              return (
                <li className={styles.entry} key={row.id}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected((values) =>
                          event.target.checked
                            ? [...values, row.id]
                            : values.filter((value) => value !== row.id),
                        )
                      }
                    />
                    <span>{row.term || "Missing word"}</span>
                  </label>
                  <p>{row.translation}</p>
                  {row.context && <blockquote>{row.context}</blockquote>}
                  <p className={styles.small}>
                    {row.batchName} · row {row.rowNumber} · {row.disposition}
                    {row.partOfSpeech ? ` · ${row.partOfSpeech}` : ""}
                    {row.duplicateOf
                      ? " · Exact duplicate in this batch; inspect before accepting"
                      : ""}
                  </p>
                  {row.error && <p role="note">{row.error}</p>}
                  {editing === row.id ? (
                    <div className={styles.stack}>
                      <label className={styles.label}>
                        Word or expression
                        <input
                          className={styles.input}
                          maxLength={10_000}
                          value={edit.term}
                          onChange={(event) =>
                            setEdit({ ...edit, term: event.target.value })
                          }
                        />
                      </label>
                      <label className={styles.label}>
                        Translation
                        <input
                          className={styles.input}
                          maxLength={10_000}
                          value={edit.translation}
                          onChange={(event) =>
                            setEdit({
                              ...edit,
                              translation: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className={styles.label}>
                        Context
                        <textarea
                          className={styles.textarea}
                          maxLength={10_000}
                          value={edit.context}
                          onChange={(event) =>
                            setEdit({ ...edit, context: event.target.value })
                          }
                        />
                      </label>
                      <div className={styles.actions}>
                        <button
                          className="button secondary"
                          disabled={!edit.term.trim()}
                          onClick={() => {
                            if (
                              updateRows([row.id], (value) => ({
                                ...value,
                                term: edit.term.trim(),
                                translation: edit.translation.trim(),
                                context: edit.context.trim(),
                                error: undefined,
                                duplicateOf: undefined,
                                senseId: null,
                              }))
                            ) {
                              setEditing(null);
                              setNotice(
                                "Import row updated. Its original file values remain in the backup.",
                              );
                            }
                          }}
                        >
                          Save row
                        </button>
                        <button
                          className="button ghost"
                          onClick={() => setEditing(null)}
                        >
                          Cancel edit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <button
                        className="button ghost"
                        onClick={() => {
                          setEditing(row.id);
                          setEdit({
                            term: row.term,
                            translation: row.translation,
                            context: row.context,
                          });
                        }}
                      >
                        Edit row
                      </button>
                      {row.disposition !== "accepted" && (
                        <button
                          className="button secondary"
                          onClick={() => setDisposition("accepted", [row.id])}
                        >
                          Accept intention
                        </button>
                      )}
                      {row.disposition !== "deferred" && (
                        <button
                          className="button ghost"
                          onClick={() => setDisposition("deferred", [row.id])}
                        >
                          Later
                        </button>
                      )}
                      {row.disposition !== "rejected" && (
                        <button
                          className="button ghost"
                          onClick={() => setDisposition("rejected", [row.id])}
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  )}
                  {row.disposition === "accepted" && (
                    <div className={styles.stack}>
                      {saved ? (
                        <>
                          <p role="status">
                            Selected meaning is saved for study. Your separate
                            practice history is preserved.
                          </p>
                          {row.senseId && (
                            <Link
                              className="text-link"
                              href={buildDictionaryHref({
                                query: row.term,
                                senseId: row.senseId,
                                returnHref: "/library/inbox",
                              })}
                            >
                              Open selected meaning in Dictionary
                            </Link>
                          )}
                        </>
                      ) : meanings.length ? (
                        <>
                          <label className={styles.label}>
                            Choose a precise meaning before studying
                            <select
                              className={styles.select}
                              aria-label={`Meaning for ${row.term}, row ${row.rowNumber}`}
                              value={choice}
                              onChange={(event) =>
                                setSenseChoices((values) => ({
                                  ...values,
                                  [row.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Keep unresolved</option>
                              {meanings.map(({ entry, sense }) => (
                                <option value={sense.id} key={sense.id}>
                                  {entry.lexeme.partOfSpeech} ·{" "}
                                  {sense.definition} — {sense.translation} ·{" "}
                                  {entry.provenance.kind === "user-authored"
                                    ? "Your definition"
                                    : "Editorial sample"}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="button secondary"
                            disabled={
                              !choice ||
                              !learning.ready ||
                              !catalog.ready ||
                              !!catalog.error
                            }
                            onClick={() => {
                              if (
                                !meanings.some(
                                  ({ sense }) => sense.id === choice,
                                )
                              )
                                return;
                              if (
                                learning.save(
                                  choice,
                                  (
                                    row.context ||
                                    `${row.term} — ${row.translation}`
                                  ).slice(0, 1000),
                                )
                              ) {
                                if (
                                  updateRows([row.id], (value) => ({
                                    ...value,
                                    senseId: choice,
                                  }))
                                )
                                  setNotice(
                                    "Chosen meaning saved by your request. Saving is a study intention, not evidence of knowledge.",
                                  );
                                else
                                  setNotice(
                                    "The meaning is saved, but the import link could not be updated. Retry linking; the saved meaning will not be duplicated.",
                                  );
                              }
                            }}
                          >
                            Add chosen meaning to study
                          </button>
                        </>
                      ) : (
                        <p className={styles.small}>
                          Meaning unresolved. Your context is kept. Describe a
                          precise meaning below, keep it for later or use a
                          configured dictionary source when one is available.
                        </p>
                      )}
                      {!saved && (
                        <details>
                          <summary>Describe another meaning yourself</summary>
                          <LexicalCatalogEditor
                            initial={{
                              lemma: row.term.slice(0, 160),
                              translation: row.translation.slice(0, 1_000),
                              example: row.context.slice(0, 2_000),
                            }}
                            onCreated={({ senseId }) => {
                              setSenseChoices((values) => ({
                                ...values,
                                [row.id]: senseId,
                              }));
                              if (
                                updateRows([row.id], (value) => ({
                                  ...value,
                                  senseId,
                                }))
                              )
                                setNotice(
                                  "Your definition is linked to this import row. Choose Add chosen meaning to study when ready; no review or evidence was created.",
                                );
                              else
                                setNotice(
                                  "Your definition was created, but its import link could not be saved. It remains available in Own dictionary; retry selecting it here without creating another definition.",
                                );
                            }}
                          />
                        </details>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {rows.length > limit && (
            <button
              className="button secondary"
              onClick={() => setLimit((value) => value + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, rows.length - limit)} more
            </button>
          )}
        </section>
        <section className={`glass-panel ${styles.panel}`}>
          <h2>Import history</h2>
          <p className={styles.small}>
            Rolling back removes an import from Inbox. Independently saved
            meanings and all practice evidence stay; this does not undo
            completed learning.
          </p>
          <ul className={styles.list}>
            {materials.state.batches.map((batch) => (
              <li className={styles.entry} key={batch.id}>
                <h3>{batch.sourceName}</h3>
                <p className={styles.small}>
                  {batch.rows.length} rows ·{" "}
                  {new Date(batch.createdAt).toLocaleDateString()}
                  {batch.rolledBackAt ? " · Rolled back" : ""}
                </p>
                {!batch.rolledBackAt && (
                  <button
                    className="button ghost"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Remove “${batch.sourceName}” from Smart Inbox? Saved meanings and practice history will stay.`,
                        )
                      )
                        return;
                      if (
                        materials.update((state) => ({
                          ...state,
                          revision: state.revision + 1,
                          batches: state.batches.map((item) =>
                            item.id === batch.id
                              ? {
                                  ...item,
                                  rolledBackAt: new Date().toISOString(),
                                }
                              : item,
                          ),
                        }))
                      )
                        setNotice(
                          "Import rolled back. Saved meanings and their learning history were not removed.",
                        );
                    }}
                  >
                    Roll back import
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        {notice && (
          <p className={styles.status} role="status">
            {notice}
          </p>
        )}
      </div>
    </Shell>
  );
}
