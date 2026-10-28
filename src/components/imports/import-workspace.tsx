"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import { useMaterials } from "@/components/materials/use-materials";
import {
  MATERIAL_LIMITS,
  type PrivateDocument,
} from "@/domain/materials/types";
import { IMPORT_LIMITS, type ImportBatch } from "@/domain/imports/types";
import {
  normalizeImportRows,
  parseDelimited,
  stableTextId,
  assertNotCancelled,
} from "@/domain/imports/lexical-import";
import {
  documentFromEpub,
  documentFromText,
} from "@/infrastructure/materials/epub";
import { rowsFromXlsx } from "@/infrastructure/materials/xlsx";
import {
  addDocument,
  addImportBatch,
} from "@/infrastructure/materials/materials-repository";
import styles from "@/components/materials/materials.module.css";
import {
  localPurgePending,
  subscribeToProfileRestore,
} from "@/infrastructure/materials/purge-signal";

export function ImportWorkspace() {
  const materials = useMaterials();
  const [kind, setKind] = useState<"reading" | "vocabulary">("reading");
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState("");
  const [title, setTitle] = useState("");
  const [encoding, setEncoding] = useState("utf-8");
  const [delimiter, setDelimiter] = useState("auto");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<PrivateDocument | ImportBatch | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedHref, setSavedHref] = useState<string | null>(null);
  const cancel = useRef<AbortController | null>(null);
  useEffect(() => () => cancel.current?.abort(), []);
  useEffect(
    () =>
      subscribeToProfileRestore(() => {
        cancel.current?.abort();
        setBusy(false);
        setError(
          "Import is paused for profile recovery. Your selected file and pasted text are still here. Finish recovery, then reopen LEXIS.",
        );
      }),
    [],
  );
  function resetPreview() {
    setPreview(null);
    setSavedHref(null);
    setNotice(null);
    setError(null);
    setRights(false);
  }
  async function prepare() {
    if (busy || localPurgePending()) return;
    const controller = new AbortController();
    cancel.current = controller;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSavedHref(null);
    setPreview(null);
    setProgress(0);
    try {
      const extension = file?.name.split(".").pop()?.toLowerCase();
      const limit =
        kind === "reading"
          ? MATERIAL_LIMITS.maxFileBytes
          : IMPORT_LIMITS.maxFileBytes;
      if (file && file.size > limit)
        throw new Error(
          `This file exceeds the ${limit / 1024 / 1024} MB limit.`,
        );
      if (!file && !paste.trim())
        throw new Error("Choose a file or paste text first.");
      const now = new Date().toISOString();
      const sourceName = file?.name ?? (title.trim() || "Pasted text");
      const control = {
        signal: controller.signal,
        onProgress: (done: number, total: number) =>
          setProgress(total ? Math.round((done / total) * 100) : 0),
      };
      let next: PrivateDocument | ImportBatch;
      if (kind === "reading" && extension === "epub") {
        next = await documentFromEpub(
          new Uint8Array(await file!.arrayBuffer()),
          sourceName,
          now,
          controller.signal,
        );
      } else if (kind === "vocabulary" && extension === "xlsx") {
        const data = await rowsFromXlsx(
          new Uint8Array(await file!.arrayBuffer()),
          control,
        );
        const id = `import:${stableTextId(JSON.stringify(data.cells))}:${stableTextId(sourceName)}`;
        next = {
          id,
          sourceName,
          format: "xlsx",
          createdAt: now,
          rows: await normalizeImportRows(data.cells, id, control),
        };
        setNotice(
          `Read ${data.sheetName}. ${data.skippedFormulas} formula cells skipped. Only the first worksheet is imported; formulas and external links are never evaluated.`,
        );
      } else {
        if (
          file &&
          !(kind === "reading" ? ["txt"] : ["txt", "csv"]).includes(
            extension ?? "",
          )
        )
          throw new Error(
            kind === "reading"
              ? "Choose a TXT or DRM-free EPUB file."
              : "Choose a TXT, CSV or XLSX file.",
          );
        const text = file
          ? new TextDecoder(encoding, { fatal: true }).decode(
              await file.arrayBuffer(),
            )
          : paste;
        assertNotCancelled(controller.signal);
        if (kind === "reading")
          next = documentFromText(
            text,
            title || sourceName.replace(/\.txt$/iu, ""),
            sourceName,
            file ? "txt" : "paste",
            now,
          );
        else {
          const cells = await parseDelimited(
            text,
            delimiter === "auto" ? undefined : delimiter,
            control,
          );
          const id = `import:${stableTextId(JSON.stringify(cells))}:${stableTextId(sourceName)}`;
          next = {
            id,
            sourceName,
            format: file ? (extension as "txt" | "csv") : "paste",
            createdAt: now,
            rows: await normalizeImportRows(cells, id, control),
          };
        }
      }
      assertNotCancelled(controller.signal);
      setPreview(next);
      setProgress(100);
    } catch (cause) {
      setError(
        controller.signal.aborted
          ? "Import cancelled. Your saved collection has not changed."
          : cause instanceof Error
            ? cause.message
            : "This file could not be opened. Your collection has not changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!preview || !rights) return;
    const isDocument = "chapters" in preview;
    if (
      materials.update((state) =>
        isDocument
          ? addDocument(state, preview)
          : addImportBatch(state, preview),
      )
    ) {
      setSavedHref(
        isDocument
          ? `/reader/${encodeURIComponent(preview.id)}`
          : "/library/inbox",
      );
      setNotice(
        isDocument
          ? "Document saved on this device. No text has been sent to an external service."
          : "Import saved to Smart Inbox. No meanings were marked unknown and no reviews were scheduled.",
      );
    }
  }
  return (
    <Shell title="Import">
      <div className={styles.header}>
        <p className="eyebrow">YOUR MATERIALS</p>
        <h1>Make it personal.</h1>
        <p className="intro-copy">
          Bring a text or vocabulary list. Preview everything before adding it.
        </p>
      </div>
      <div className={styles.stack}>
        <section className={`glass-panel ${styles.panel}`}>
          <div className={styles.row} aria-label="Import type">
            {(["reading", "vocabulary"] as const).map((value) => (
              <button
                key={value}
                className={`button ${kind === value ? "primary" : "secondary"}`}
                aria-pressed={kind === value}
                disabled={busy}
                onClick={() => {
                  setKind(value);
                  setFile(null);
                  resetPreview();
                }}
              >
                {value === "reading" ? "Reading material" : "Vocabulary list"}
              </button>
            ))}
          </div>
          <p className={styles.small}>
            {kind === "reading"
              ? "TXT / DRM-free EPUB up to 10 MB. EPUB: 500 files, 20 MB expanded, 250 chapters; readable text only. Images, scripts and embedded media are excluded."
              : "TXT / CSV / XLSX up to 5 MB, 10,000 rows, 32 columns, 10,000 characters per field. XLSX: first worksheet; formulas/macros/external connections are not imported."}
          </p>
          <label className={styles.label}>
            Choose a file
            <input
              className={styles.file}
              type="file"
              accept={kind === "reading" ? ".txt,.epub" : ".txt,.csv,.xlsx"}
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                resetPreview();
              }}
            />
          </label>
          <label className={styles.label}>
            Title / source name
            <input
              className={styles.input}
              maxLength={300}
              value={title}
              disabled={busy}
              onChange={(event) => {
                setTitle(event.target.value);
                resetPreview();
              }}
            />
          </label>
          <label className={styles.label}>
            {file ? "Or remove the file to use pasted text" : "Paste text"}
            <textarea
              className={styles.textarea}
              maxLength={
                kind === "reading"
                  ? MATERIAL_LIMITS.maxDocumentCharacters
                  : IMPORT_LIMITS.maxTotalCharacters
              }
              disabled={busy || !!file}
              value={paste}
              onChange={(event) => {
                setPaste(event.target.value);
                resetPreview();
              }}
              placeholder={
                kind === "reading"
                  ? "Your English text…"
                  : "Word,Translation,Context,Source,POS\nlinger,задерживаться,We lingered by the sea.,My notes,verb"
              }
            />
          </label>
          {file && (
            <label className={styles.label}>
              Text encoding
              <select
                className={styles.select}
                value={encoding}
                disabled={busy}
                onChange={(event) => {
                  setEncoding(event.target.value);
                  resetPreview();
                }}
              >
                <option value="utf-8">UTF-8</option>
                <option value="windows-1251">Windows-1251</option>
                <option value="utf-16le">UTF-16 LE</option>
              </select>
            </label>
          )}
          {kind === "vocabulary" && (
            <>
              <label className={styles.label}>
                Separator
                <select
                  className={styles.select}
                  value={delimiter}
                  disabled={busy}
                  onChange={(event) => {
                    setDelimiter(event.target.value);
                    resetPreview();
                  }}
                >
                  <option value="auto">Detect</option>
                  <option value=",">Comma</option>
                  <option value=";">Semicolon</option>
                  <option value={"\t"}>Tab</option>
                </select>
              </label>
              <details className={styles.small}>
                <summary>Supported Reverso copy / export format</summary>
                <p>
                  Use an exported or copied table with Word, Translation,
                  Context, Source, POS columns (tab or CSV). Original text /
                  Translated text / Original context headers are supported. This
                  imports your supplied data; it does not access your Reverso
                  account.
                </p>
              </details>
            </>
          )}
          <div className={styles.actions}>
            <button
              className="button primary"
              disabled={busy || !materials.ready}
              onClick={prepare}
            >
              Preview import
            </button>
            {busy && (
              <button
                className="button secondary"
                onClick={() => cancel.current?.abort()}
              >
                Cancel
              </button>
            )}
          </div>
          {busy && (
            <div role="status">
              <progress
                max={100}
                value={progress}
                aria-label="Import progress"
              />{" "}
              Preparing preview… {progress}%
            </div>
          )}
          {(error || materials.error) && (
            <p
              className="status-banner error"
              role="alert"
              aria-label="Import error"
            >
              {error || materials.error}
            </p>
          )}
        </section>
        {preview && (
          <section
            className={`glass-panel ${styles.panel}`}
            aria-label="Import preview"
          >
            <h2>Review before saving</h2>
            {"chapters" in preview ? (
              <>
                <h3>{preview.title}</h3>
                <p className={styles.small}>
                  {preview.chapters.length} chapters ·{" "}
                  {preview.chapters.reduce(
                    (sum, chapter) => sum + chapter.paragraphs.length,
                    0,
                  )}{" "}
                  paragraphs
                </p>
                <blockquote>
                  {preview.chapters
                    .find((chapter) => chapter.paragraphs.length)
                    ?.paragraphs[0].slice(0, 700)}
                </blockquote>
              </>
            ) : (
              <>
                <p>
                  {preview.rows.length} rows ·{" "}
                  {preview.rows.filter((row) => row.duplicateOf).length} exact
                  duplicates · {preview.rows.filter((row) => row.error).length}{" "}
                  rows need repair
                </p>
                <p className={styles.small}>
                  Every meaning starts unresolved. Accept, defer, reject or edit
                  rows in Smart Inbox. An import is not a knowledge assessment.
                </p>
                <div className={styles.preview}>
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Word / expression</th>
                        <th>Translation</th>
                        <th>Context / status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 30).map((row) => (
                        <tr key={row.id}>
                          <td>{row.rowNumber}</td>
                          <td>{row.term || "Missing word"}</td>
                          <td>{row.translation}</td>
                          <td>
                            {row.context}
                            {row.error && <p>{row.error}</p>}
                            {row.duplicateOf && (
                              <p>
                                Exact duplicate of{" "}
                                {row.duplicateOf.split(":").pop()}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > 30 && (
                  <p className={styles.small}>
                    First 30 rows shown. All rows remain available in Smart
                    Inbox.
                  </p>
                )}
              </>
            )}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={rights}
                onChange={(event) => setRights(event.target.checked)}
              />
              I am allowed to use this material. Store it privately on this
              device; do not upload it or send it to AI.
            </label>
            <button
              className="button primary"
              disabled={!rights || !!savedHref || !materials.ready}
              onClick={save}
            >
              {"chapters" in preview ? "Save document" : "Add to Smart Inbox"}
            </button>
          </section>
        )}
        {notice && (
          <p className={styles.status} role="status">
            {notice}
          </p>
        )}
        {savedHref && (
          <Link className="button secondary" href={savedHref}>
            Continue{" "}
            {savedHref === "/library/inbox" ? "to Smart Inbox" : "reading"}
          </Link>
        )}
        <Link className="text-link" href="/library">
          Back to Library
        </Link>
        <p className={styles.small}>
          Local mode: material is stored in this browser, without account sync
          or cloud backup. Browser storage can be cleared or evicted. Export a
          backup in Library.
        </p>
      </div>
    </Shell>
  );
}
