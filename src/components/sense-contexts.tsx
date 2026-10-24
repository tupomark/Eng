"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSenseContext,
  emptySenseContexts,
  mergeSenseContexts,
  parseSenseContexts,
  removeSenseContext,
  senseContextIdentity,
  type SavedSenseContext,
  type SenseContextState,
} from "@/domain/sense-contexts";
import {
  BrowserSenseContextRepository,
  SENSE_CONTEXTS_KEY,
  SENSE_CONTEXTS_LIMIT,
} from "@/infrastructure/storage/browser-sense-contexts";
import { subscribeToLocalPurge } from "@/infrastructure/materials/purge-signal";
import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";
const CHANGE = "lexis-sense-contexts-change";
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "This passage could not be saved. Your original data is unchanged.";
export function useSenseContexts() {
  const [state, setState] = useState<SenseContextState>(emptySenseContexts);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<ReturnType<
    BrowserSenseContextRepository["read"]
  > | null>(null);
  const paused = useRef(false);
  const reload = useCallback(() => {
    if (paused.current) return;
    try {
      const next = new BrowserSenseContextRepository(
        window.localStorage,
      ).read();
      current.current = next;
      setState(next.state);
      setError("");
    } catch (cause) {
      current.current = null;
      setError(message(cause));
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      if (mounted) reload();
    });
    const changed = (event: StorageEvent) => {
      if (event.key === SENSE_CONTEXTS_KEY || event.key === null) reload();
    };
    window.addEventListener("storage", changed);
    window.addEventListener(CHANGE, reload);
    const release = subscribeToLocalPurge(() => {
      paused.current = true;
      current.current = null;
      setState(emptySenseContexts());
      setError(
        "Saved passages are paused for local profile deletion. Reopen LEXIS after it completes.",
      );
      setReady(true);
    });
    return () => {
      mounted = false;
      release();
      window.removeEventListener("storage", changed);
      window.removeEventListener(CHANGE, reload);
    };
  }, [reload]);
  const commit = (next: SenseContextState, expected: string | null) => {
    if (paused.current || !current.current)
      throw new Error(
        "Readable saved passages are required before making changes. Reload after recovery.",
      );
    const serialized = new BrowserSenseContextRepository(
      window.localStorage,
    ).commit(next, expected);
    current.current = { state: next, serialized };
    setState(next);
    setError("");
    window.dispatchEvent(new Event(CHANGE));
  };
  const save = (
    input: Omit<SavedSenseContext, "id" | "savedAt">,
  ): { id: string; added: boolean } | null => {
    try {
      if (!current.current || paused.current)
        throw new Error(
          "Saved passages are not available for writing. Reload after recovery.",
        );
      assertLocalWritesAllowed(window.localStorage);
      if (
        new BrowserSenseContextRepository(window.localStorage).read()
          .serialized !== current.current.serialized
      )
        throw new Error(
          "Your saved passages changed in another tab. Reload them before saving again.",
        );
      const existing = current.current.state.contexts.find(
        (item) => senseContextIdentity(item) === senseContextIdentity(input),
      );
      if (existing) return { id: existing.id, added: false };
      const item = {
        ...input,
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
      };
      const next = addSenseContext(current.current.state, item);
      commit(next, current.current.serialized);
      return { id: item.id, added: true };
    } catch (cause) {
      setError(message(cause));
      return null;
    }
  };
  const remove = (id: string): boolean => {
    try {
      if (!current.current)
        throw new Error(
          "Saved passages are not readable. Recover them before changing data.",
        );
      commit(
        removeSenseContext(current.current.state, id),
        current.current.serialized,
      );
      return true;
    } catch (cause) {
      setError(message(cause));
      return false;
    }
  };
  return {
    state,
    ready,
    error,
    reload,
    save,
    remove,
    snapshot: () => current.current,
    commit,
  };
}
export function SavedPassageList({ items }: { items: SavedSenseContext[] }) {
  if (!items.length) return null;
  return (
    <details>
      <summary>Saved source passages ({items.length})</summary>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <blockquote>{item.excerpt}</blockquote>
            {item.source && (
              <p className="tiny muted">
                Source version {item.source.documentVersion} · chapter{" "}
                {item.source.chapterId} · paragraph{" "}
                {item.source.paragraphIndex + 1}
              </p>
            )}
          </li>
        ))}
      </ol>
      <p className="tiny muted">
        These are saved sources, not extra knowledge observations. Source
        deletion keeps saved learning excerpts; remove them separately in
        Dictionary.
      </p>
    </details>
  );
}
function download(serialized: string) {
  const url = URL.createObjectURL(
    new Blob([serialized], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "lexis-sense-contexts-v1.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
export function SenseContextBackup() {
  const passages = useSenseContexts();
  const [preview, setPreview] = useState<{
    state: SenseContextState;
    expected: string | null;
    added: number;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const previewRequest = useRef(0);
  return (
    <details>
      <summary>Saved passage backup and recovery</summary>
      <section aria-label="Saved passage backup">
        <p>
          Private source passages are stored separately from the original
          learning history. Export them with your other backups. This file does
          not contain books or learning evidence.
        </p>
        {(error || passages.error) && (
          <p role="alert">{error || passages.error}</p>
        )}
        <div className="device-actions">
          <button
            className="button secondary"
            disabled={!passages.ready}
            onClick={() => {
              try {
                download(
                  localStorage.getItem(SENSE_CONTEXTS_KEY) ??
                    JSON.stringify(emptySenseContexts()),
                );
              } catch (cause) {
                setError(message(cause));
              }
            }}
          >
            Export saved passages / original
          </button>
          <button className="button ghost" onClick={passages.reload}>
            Reload saved passages
          </button>
        </div>
        <label>
          Saved passage backup
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            aria-label="Choose saved passage backup"
            onChange={async (event) => {
              const request = ++previewRequest.current;
              const file = event.target.files?.[0];
              setPreview(null);
              setNotice("");
              setError("");
              if (!file) return;
              try {
                // UTF-8 can use three bytes per UTF-16 code unit; valid own exports must restore.
                if (file.size > SENSE_CONTEXTS_LIMIT * 3)
                  throw new Error(
                    "This backup exceeds the saved passage size limit.",
                  );
                const text = await file.text();
                if (request !== previewRequest.current) return;
                assertLocalWritesAllowed(window.localStorage);
                if (text.length > SENSE_CONTEXTS_LIMIT)
                  throw new Error(
                    "This backup exceeds the saved passage size limit.",
                  );
                const current = passages.snapshot();
                if (!current)
                  throw new Error(
                    "Recover the current saved passages before merging a backup.",
                  );
                const next = mergeSenseContexts(
                  current.state,
                  parseSenseContexts(JSON.parse(text)),
                );
                setPreview({
                  state: next,
                  expected: current.serialized,
                  added: next.contexts.length - current.state.contexts.length,
                });
              } catch (cause) {
                if (request === previewRequest.current)
                  setError(message(cause));
              }
            }}
          />
        </label>
        {preview && (
          <div>
            <p>
              {preview.added} new passages. Existing IDs, sources and learning
              history will be preserved. Conflicting IDs stop the merge.
            </p>
            <button
              className="button secondary"
              onClick={() => {
                try {
                  passages.commit(preview.state, preview.expected);
                  setPreview(null);
                  setNotice(
                    "Saved passages merged on this device. Learning history was not changed.",
                  );
                } catch (cause) {
                  setError(message(cause));
                }
              }}
            >
              Confirm passage merge
            </button>
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
    </details>
  );
}
