"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMaterials, downloadLocalJson } from "./use-materials";
import {
  MATERIALS_STORAGE_KEY,
  mergeMaterials,
  parseMaterialsState,
} from "@/infrastructure/materials/materials-repository";
import type { MaterialsState } from "@/domain/materials/types";
import { purgeTemporaryDocumentContext } from "@/infrastructure/materials/context-retention";
import styles from "./materials.module.css";

export function MaterialLibrary() {
  const materials = useMaterials();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [restore, setRestore] = useState<MaterialsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const documents = materials.state.documents.filter(
    (document) =>
      (showArchived || !document.archivedAt) &&
      `${document.title} ${document.sourceName}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const inbox = materials.state.batches
    .filter((batch) => !batch.rolledBackAt)
    .reduce(
      (sum, batch) =>
        sum +
        batch.rows.filter(
          (row) =>
            row.disposition === "pending" || row.disposition === "deferred",
        ).length,
      0,
    );
  function exportData(raw = false) {
    try {
      const value = raw
        ? (window.localStorage.getItem(MATERIALS_STORAGE_KEY) ?? "null")
        : JSON.stringify(materials.state, null, 2);
      downloadLocalJson(
        raw ? "lexis-materials-raw-backup.json" : "lexis-materials-v1.json",
        value,
      );
      setNotice(
        raw
          ? "Original storage bytes exported without modifying them."
          : "Materials exported. Your learning history is exported separately in Core.",
      );
    } catch {
      setError(
        "The backup could not be read. Your existing data has not changed.",
      );
    }
  }
  async function readRestore(file: File | undefined) {
    if (!file) return;
    setError(null);
    setRestore(null);
    try {
      if (file.size > 20_000_000)
        throw new Error("This backup exceeds the 20 MB restore limit.");
      setRestore(parseMaterialsState(JSON.parse(await file.text())));
    } catch {
      setError(
        "This is not a supported materials v1 backup. Your current library has not changed.",
      );
    }
  }
  return (
    <section
      className={`glass-panel ${styles.panel}`}
      aria-label="Your private materials"
    >
      <div className={styles.row}>
        <h2>
          Your documents{" "}
          <span className="count-label">
            {
              materials.state.documents.filter(
                (document) => !document.archivedAt,
              ).length
            }
          </span>
        </h2>
        <Link className="button secondary" href="/library/import">
          Import material
        </Link>
        <Link className="button ghost" href="/library/inbox">
          Smart Inbox · {inbox}
        </Link>
      </div>
      <p className={styles.small}>
        Private on this device. Books and imports are not uploaded or sent to
        AI. A browser backup is not cloud sync.
      </p>
      {(materials.error || error) && (
        <p className="status-banner error" role="alert">
          {error || materials.error}
        </p>
      )}
      <label className={styles.label}>
        Search documents
        <input
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Show archived documents
      </label>
      {!materials.ready ? (
        <p role="status">Opening your materials…</p>
      ) : !documents.length ? (
        <p className={styles.small}>
          {query
            ? "No documents match this search."
            : "Bring a TXT or DRM-free EPUB, or paste a text to start reading your own material."}
        </p>
      ) : (
        <ul className={styles.list}>
          {documents.slice(0, 30).map((document) => (
            <li className={styles.entry} key={document.id}>
              <h3>{document.title}</h3>
              <p className={styles.small}>
                {document.format.toUpperCase()} · {document.chapters.length}{" "}
                chapters · {document.sourceName}
                {document.archivedAt ? " · Archived" : ""}
              </p>
              <div className={styles.actions}>
                <Link
                  className="button secondary"
                  href={`/reader/${document.id}`}
                >
                  Continue reading
                </Link>
                <button
                  className="button ghost"
                  onClick={() => {
                    const title = window.prompt(
                      "Document title",
                      document.title,
                    );
                    if (title === null || !title.trim()) return;
                    if (
                      materials.update((state) => ({
                        ...state,
                        revision: state.revision + 1,
                        documents: state.documents.map((item) =>
                          item.id === document.id
                            ? {
                                ...item,
                                title: title.trim().slice(0, 300),
                                updatedAt: new Date().toISOString(),
                              }
                            : item,
                        ),
                      }))
                    )
                      setNotice(
                        "Document renamed. Your reading position and learning history are unchanged.",
                      );
                  }}
                >
                  Rename
                </button>
                <button
                  className="button ghost"
                  onClick={() => {
                    if (
                      materials.update((state) => ({
                        ...state,
                        revision: state.revision + 1,
                        documents: state.documents.map((item) =>
                          item.id === document.id
                            ? {
                                ...item,
                                archivedAt: item.archivedAt
                                  ? undefined
                                  : new Date().toISOString(),
                              }
                            : item,
                        ),
                      }))
                    )
                      setNotice(
                        document.archivedAt
                          ? "Document returned to Library."
                          : "Document archived. Text, bookmarks and learning history are kept.",
                      );
                  }}
                >
                  {document.archivedAt ? "Unarchive" : "Archive"}
                </button>
                <button
                  className="button ghost"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete “${document.title}” from this device, including its text, bookmarks and reading position? Saved dictionary contexts and learning history are kept; manage those separately in Core.`,
                      )
                    )
                      return;
                    try {
                      purgeTemporaryDocumentContext(
                        document.id,
                        window.sessionStorage,
                      );
                    } catch {
                      setError(
                        "This document could not be fully deleted because its temporary lookup context could not be cleared. Your document has been kept; export a backup before recovery.",
                      );
                      return;
                    }
                    if (
                      materials.update((state) => ({
                        ...state,
                        revision: state.revision + 1,
                        documents: state.documents.filter(
                          (item) => item.id !== document.id,
                        ),
                      }))
                    )
                      setNotice(
                        "Document text, bookmarks and position deleted from this device. Saved learning excerpts remain in Core until separately removed.",
                      );
                  }}
                >
                  Delete document
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Backup and recovery</summary>
        <div className={styles.stack}>
          <p className={styles.small}>
            This backup contains your private documents and import rows. It
            excludes learning evidence (export separately in Core), Reader
            appearance settings and session-only Dictionary context. Restore
            previews counts and merges without overwriting conflicting existing
            records.
          </p>
          <div className={styles.actions}>
            <button
              className="button secondary"
              disabled={!materials.ready || !!materials.error}
              onClick={() => exportData()}
            >
              Export materials
            </button>
            <button className="button ghost" onClick={() => exportData(true)}>
              Export original storage
            </button>
            <button
              className="button ghost"
              onClick={() => input.current?.click()}
            >
              Preview restore
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className={styles.file}
            onChange={(event) => readRestore(event.target.files?.[0])}
            aria-label="Choose materials backup"
          />
          {restore && (
            <div className={styles.entry}>
              <p>
                Restore preview: {restore.documents.length} documents,{" "}
                {restore.batches.length} import batches. Existing matching
                documents stay; conflicting imports stop the operation.
              </p>
              <div className={styles.actions}>
                <button
                  className="button primary"
                  onClick={() => {
                    if (
                      materials.update((state) =>
                        mergeMaterials(state, restore),
                      )
                    ) {
                      setRestore(null);
                      setNotice(
                        "Materials restored and saved. Existing learning history was not changed.",
                      );
                    }
                  }}
                >
                  Confirm merge
                </button>
                <button
                  className="button ghost"
                  onClick={() => setRestore(null)}
                >
                  Cancel restore
                </button>
              </div>
            </div>
          )}
        </div>
      </details>
      {notice && (
        <p className={styles.status} role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
