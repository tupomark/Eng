"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Download, Plus } from "lucide-react";
import { Modal } from "@/components/modal";
import {
  archiveWritingDraft,
  createWritingDraft,
  currentWritingRevision,
  saveWritingRevision,
  saveWritingView,
  writingContext,
  WRITING_LIMITS,
  type WritingDraft,
  type WritingKind,
  type WritingView,
  type WritingWorkspace,
} from "@/domain/writing/workspace";
import { GRAMMAR_CONCEPTS, writingDifference } from "@/domain/writing/grammar";
import {
  WritingRepository,
  WRITING_CHANGED_EVENT,
} from "@/infrastructure/writing/repository";
import { putWritingContext } from "@/infrastructure/writing/context";
import {
  confirmWritingRestore,
  MAX_WRITING_BACKUP_BYTES,
  previewWritingRestore,
  type WritingRestorePreview,
} from "@/domain/writing/restore";
import styles from "./workspace.module.css";
import { subscribeToLocalPurge } from "@/infrastructure/materials/purge-signal";

function download(value: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function WritingStudio({
  initialDraftId,
  resume = false,
}: {
  initialDraftId?: string;
  resume?: boolean;
}) {
  const router = useRouter();
  const [repository] = useState(() => new WritingRepository());
  const [workspace, setWorkspace] = useState<WritingWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [editor, setEditor] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"write" | "feedback" | "improve">("write");
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<WritingKind>("free");
  const [conceptId, setConceptId] = useState(GRAMMAR_CONCEPTS[0].id);
  const [composing, setComposing] = useState(false);
  const [visibleRevisions, setVisibleRevisions] = useState(10);
  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(
    null,
  );
  const [restorePreview, setRestorePreview] =
    useState<WritingRestorePreview | null>(null);
  const [restoreError, setRestoreError] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const editing = useRef<{
    draftId: string | null;
    baseId: string | null;
    text: string;
  }>({ draftId: null, baseId: null, text: "" });
  const initialized = useRef(false);
  const pendingView = useRef<{ view: WritingView; focus: boolean } | null>(
    null,
  );
  const inFlight = useRef(false);
  const stoppedForPurge = useRef(false);
  const selected = workspace?.drafts.find((draft) => draft.id === selectedId);
  const baseRevision = selected?.revisions.find(
    (revision) => revision.id === baseId,
  );
  const dirty = Boolean(
    selected && baseRevision && editor !== baseRevision.text,
  );
  const conflicted = Boolean(selected && selected.tips.length > 1);

  const choose = useCallback((draft: WritingDraft, focus = false) => {
    if (stoppedForPurge.current) return;
    const revision = currentWritingRevision(draft);
    editing.current = {
      draftId: draft.id,
      baseId: revision.id,
      text: revision.text,
    };
    pendingView.current = { view: draft.view, focus };
    setSelectedId(draft.id);
    setBaseId(revision.id);
    setEditor(revision.text);
    setPreviewRevisionId(null);
    setTab("write");
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.set("draft", draft.id);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (stoppedForPurge.current) return;
      try {
        const next = await repository.read();
        if (!active || stoppedForPurge.current) return;
        if (stoppedForPurge.current) return;
        setWorkspace(next);
        if (!initialized.current) {
          initialized.current = true;
          const draft =
            next.drafts.find((item) => item.id === initialDraftId) ??
            next.drafts.find((item) => !item.archivedAt);
          if (draft) choose(draft, resume);
        } else {
          const current = editing.current;
          const draft = next.drafts.find((item) => item.id === current.draftId);
          const base = draft?.revisions.find(
            (item) => item.id === current.baseId,
          );
          if (
            draft &&
            base &&
            current.text === base.text &&
            draft.tips.length === 1 &&
            draft.headId !== current.baseId
          )
            choose(draft);
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Writing data could not be opened. Existing data has been kept.",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(WRITING_CHANGED_EVENT);
    if (channel)
      channel.onmessage = () => {
        void load();
      };
    window.addEventListener("focus", load);
    window.addEventListener(WRITING_CHANGED_EVENT, load);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener("focus", load);
      window.removeEventListener(WRITING_CHANGED_EVENT, load);
    };
  }, [repository, initialDraftId, resume, choose, reloadNonce]);

  useEffect(
    () =>
      subscribeToLocalPurge(() => {
        stoppedForPurge.current = true;
        editing.current = { draftId: null, baseId: null, text: "" };
        pendingView.current = null;
        setWorkspace(null);
        setEditor("");
        setSelectedId(null);
        setBaseId(null);
        setRestorePreview(null);
        setSaving(false);
        setError(
          "Writing is paused for local data removal. Finish deletion in Settings, then start a fresh local profile.",
        );
        return repository.stopForLocalPurge();
      }),
    [repository],
  );

  useEffect(() => {
    const requested = pendingView.current;
    const element = textarea.current;
    if (!requested || !element || tab !== "write") return;
    pendingView.current = null;
    element.setSelectionRange(requested.view.start, requested.view.end);
    element.scrollTop = requested.view.scrollTop;
    if (requested.focus) element.focus({ preventScroll: true });
  }, [selectedId, editor, tab, baseId]);

  const captureView = () => ({
    start: textarea.current?.selectionStart ?? 0,
    end: textarea.current?.selectionEnd ?? 0,
    scrollTop: textarea.current?.scrollTop ?? 0,
  });

  const saveCurrent = useCallback(async (): Promise<WritingDraft | null> => {
    if (stoppedForPurge.current) return null;
    const current = editing.current;
    if (!workspace || !current.draftId || !current.baseId || inFlight.current)
      return null;
    const draft = workspace.drafts.find((item) => item.id === current.draftId);
    const base = draft?.revisions.find((item) => item.id === current.baseId);
    if (!draft || !base) return null;
    if (draft.tips.length > 1 && current.text !== base.text) {
      setError(
        "Review the conflicting versions before editing further. Your current text can be downloaded below.",
      );
      return null;
    }
    if (current.text === base.text) return draft;
    inFlight.current = true;
    setSaving(true);
    const input = {
      draftId: current.draftId,
      baseId: current.baseId,
      text: current.text,
      revisionId: crypto.randomUUID(),
      now: new Date().toISOString(),
    };
    try {
      const next = await repository.command((state) =>
        saveWritingRevision(state, input),
      );
      if (stoppedForPurge.current) return null;
      setWorkspace(next);
      const updated = next.drafts.find((item) => item.id === input.draftId)!;
      const persisted =
        updated.revisions.find((item) => item.id === input.revisionId) ??
        currentWritingRevision(updated);
      if (
        editing.current.draftId === input.draftId &&
        editing.current.baseId === input.baseId
      ) {
        editing.current.baseId = persisted.id;
        setBaseId(persisted.id);
      }
      setError("");
      return updated;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This draft could not be saved. Your text is still in the editor.",
      );
      return null;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, [repository, workspace]);

  useEffect(() => {
    if (!dirty || saving || error || composing || conflicted) return;
    const timer = window.setTimeout(() => {
      void saveCurrent();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [
    dirty,
    saving,
    error,
    composing,
    conflicted,
    editor,
    baseId,
    saveCurrent,
  ]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function persistView(draft: WritingDraft) {
    const view = captureView();
    const text = currentWritingRevision(draft).text;
    return repository.command((state) =>
      saveWritingView(state, draft.id, draft.headId, {
        start: Math.min(view.start, text.length),
        end: Math.min(view.end, text.length),
        scrollTop: view.scrollTop,
      }),
    );
  }

  async function changeDraft(id: string) {
    if (dirty && !(await saveCurrent())) return;
    const draft = workspace?.drafts.find((item) => item.id === id);
    if (draft) choose(draft, true);
  }

  async function createDraft() {
    if (dirty && !(await saveCurrent())) return;
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      const next = await repository.command((state) =>
        createWritingDraft(state, {
          id,
          revisionId: crypto.randomUUID(),
          title: newTitle,
          kind: newKind,
          now: new Date().toISOString(),
        }),
      );
      if (stoppedForPurge.current) return;
      setWorkspace(next);
      choose(
        next.drafts.find((item) => item.id === id)!,
        true,
      );
      setNewOpen(false);
      setNewTitle("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The new draft could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function restoreRevision(revisionId: string, resolve = false) {
    if (!selected || saving) return;
    const revision = selected.revisions.find((item) => item.id === revisionId);
    if (!revision) return;
    setSaving(true);
    try {
      const next = await repository.command((state) =>
        saveWritingRevision(state, {
          draftId: selected.id,
          baseId: resolve ? revision.id : selected.headId,
          revisionId: crypto.randomUUID(),
          text: revision.text,
          now: new Date().toISOString(),
          origin: "restored",
          resolve,
          expectedTips: selected.tips,
        }),
      );
      if (stoppedForPurge.current) return;
      setWorkspace(next);
      choose(
        next.drafts.find((item) => item.id === selected.id)!,
        true,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This version could not be restored. All versions have been kept.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function openGrammar() {
    const view = captureView();
    const draft = dirty ? await saveCurrent() : selected;
    if (!draft || draft.tips.length > 1) {
      setError(
        "Resolve the saved versions before opening this draft in Grammar.",
      );
      return;
    }
    try {
      await persistView(draft);
      if (stoppedForPurge.current) return;
      const revision = currentWritingRevision(draft);
      const start =
        view.start === view.end ? Math.max(0, view.start - 300) : view.start;
      const end =
        view.start === view.end
          ? Math.min(revision.text.length, view.end + 300)
          : view.end;
      const token = putWritingContext(
        writingContext(draft, start, end, new Date().toISOString()),
      );
      router.push(
        `/grammar?concept=${encodeURIComponent(conceptId)}&context=${encodeURIComponent(token)}&draft=${encodeURIComponent(draft.id)}`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The local context could not be saved. Your draft has been kept.",
      );
    }
  }

  async function archiveSelected() {
    if (!selected || (dirty && !(await saveCurrent()))) return;
    try {
      const next = await repository.command((state) =>
        archiveWritingDraft(
          state,
          selected.id,
          new Date().toISOString(),
          !selected.archivedAt,
        ),
      );
      if (stoppedForPurge.current) return;
      setWorkspace(next);
      choose(next.drafts.find((item) => item.id === selected.id)!);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The archive change could not be saved.",
      );
    }
  }

  async function prepareRestore(file: File) {
    if (!workspace || saving) return;
    if (file.size > MAX_WRITING_BACKUP_BYTES) {
      setError("Choose a writing JSON backup smaller than 64 MB.");
      return;
    }
    if (dirty && !(await saveCurrent())) return;
    setSaving(true);
    try {
      const current = await repository.read();
      const preview = previewWritingRestore(current, await file.text());
      if (stoppedForPurge.current) return;
      setRestorePreview(preview);
      setRestoreError("");
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This writing backup could not be previewed. Existing drafts are unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function restoreBackup() {
    if (!restorePreview || saving) return;
    setSaving(true);
    try {
      const next = await repository.command((state) =>
        confirmWritingRestore(state, restorePreview),
      );
      if (stoppedForPurge.current) return;
      setWorkspace(next);
      const draft =
        next.drafts.find((item) => item.id === selectedId) ??
        next.drafts.find((item) => !item.archivedAt) ??
        next.drafts[0];
      if (draft) choose(draft);
      setRestorePreview(null);
      setRestoreError("");
    } catch (cause) {
      setRestoreError(
        cause instanceof Error
          ? cause.message
          : "This backup could not be restored. Existing drafts are unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }

  const preview = selected?.revisions.find(
    (revision) => revision.id === previewRevisionId,
  );
  const diff = preview ? writingDifference(preview.text, editor) : null;
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <Link
          href="/learn"
          className="text-link"
          onClick={async (event) => {
            event.preventDefault();
            if (dirty && !(await saveCurrent())) return;
            if (selected) {
              try {
                await persistView(selected);
              } catch {
                setError(
                  "Your cursor position could not be saved. Your draft remains open.",
                );
                return;
              }
            }
            router.push("/learn");
          }}
        >
          <ArrowLeft size={17} /> Learn
        </Link>
        <span className="eyebrow">WRITING STUDIO · ON THIS DEVICE</span>
        <button
          className="button secondary small"
          onClick={() => setNewOpen(true)}
          disabled={loading || saving || !workspace}
        >
          <Plus size={16} /> New draft
        </button>
      </header>
      <div className={styles.heading}>
        <h1>A thought, in your own words.</h1>
        <p className="muted">
          Write freely. Keep every version. Explore a rule when you need it.
        </p>
      </div>
      {error && (
        <div role="alert" className={styles.alert}>
          <p>{error}</p>
          <div className={styles.actions}>
            <button
              className="button secondary small"
              onClick={() => {
                setError("");
                if (!workspace) {
                  setLoading(true);
                  setReloadNonce((value) => value + 1);
                } else void saveCurrent();
              }}
            >
              {workspace ? "Retry save" : "Retry opening writing"}
            </button>
            <button
              className="button ghost small"
              onClick={() =>
                download(
                  editor,
                  "lexis-current-writing.txt",
                  "text/plain;charset=utf-8",
                )
              }
            >
              Download current text
            </button>
          </div>
        </div>
      )}
      {loading ? (
        <p role="status">Opening your private drafts…</p>
      ) : !workspace ? (
        <div className={styles.empty}>
          <h2>Your writing data has been kept.</h2>
          <p>
            Storage could not be opened safely. Retry after checking browser
            storage; no existing writing has been replaced.
          </p>
          <button
            className="button secondary"
            onClick={async () => {
              try {
                download(
                  JSON.stringify(await repository.rawBackup(), null, 2),
                  "lexis-writing-backup.json",
                  "application/json",
                );
              } catch {
                setError(
                  "The stored writing could not be exported. Existing data remains unchanged.",
                );
              }
            }}
          >
            Export stored writing
          </button>
        </div>
      ) : (
        <>
          {workspace.drafts.length > 0 && (
            <div className={styles.toolbar}>
              <label className={styles.label}>
                Your drafts
                <select
                  aria-label="Choose writing draft"
                  value={selectedId ?? ""}
                  onChange={(event) => {
                    void changeDraft(event.target.value);
                  }}
                >
                  {workspace.drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.title}
                      {draft.archivedAt ? " · archived" : ""}
                      {draft.tips.length > 1 ? " · versions to review" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button ghost small"
                onClick={async () => {
                  try {
                    download(
                      JSON.stringify(await repository.rawBackup(), null, 2),
                      "lexis-writing-backup.json",
                      "application/json",
                    );
                  } catch {
                    setError(
                      "Writing could not be exported. Your data remains stored.",
                    );
                  }
                }}
              >
                <Download size={15} /> Export writing
              </button>
            </div>
          )}
          {!selected ? (
            <div className={styles.empty}>
              <h2>A blank page is a useful beginning.</h2>
              <p>
                Your text stays on this device. No AI service receives it.
                Browser storage can be cleared, so export writing you want to
                keep.
              </p>
              <button
                className="button primary"
                onClick={() => setNewOpen(true)}
              >
                Create your first draft <Plus size={17} />
              </button>
              <Link href="/grammar" className="text-link">
                Explore Grammar Atlas <ArrowUpRight size={15} />
              </Link>
            </div>
          ) : (
            <>
              <div className={styles.row}>
                <h2>{selected.title}</h2>
                <span
                  role="status"
                  aria-live="polite"
                  className={styles.status}
                >
                  {selected.archivedAt
                    ? "Archived · all versions kept"
                    : saving
                      ? "Saving…"
                      : conflicted
                        ? dirty
                          ? "Unsaved text · conflicting versions to review"
                          : "Conflicting versions saved · review both"
                        : dirty
                          ? "Unsaved changes"
                          : "Saved on this device"}
                </span>
              </div>
              {conflicted && (
                <section
                  aria-label="Writing versions conflict"
                  className={styles.alert}
                >
                  <h3>Both versions are safe.</h3>
                  <p>
                    Another edit arrived while this draft was open. Review the
                    branches and explicitly choose a starting point; every
                    earlier version remains in history.
                  </p>
                  {selected.tips.map((id) => {
                    const revision = selected.revisions.find(
                      (item) => item.id === id,
                    )!;
                    return (
                      <details key={id} className={styles.revision}>
                        <summary>
                          {id === baseId
                            ? "Your version"
                            : id === selected.headId
                              ? "Current stored version"
                              : "Another version"}{" "}
                          · {new Date(revision.createdAt).toLocaleString()}
                        </summary>
                        <p className={styles.prose}>
                          {revision.text || "Empty draft"}
                        </p>
                        <button
                          className="button secondary small"
                          onClick={() => {
                            void restoreRevision(id, true);
                          }}
                          disabled={saving}
                        >
                          Continue from this version
                        </button>
                      </details>
                    );
                  })}
                </section>
              )}
              <div className={styles.tabs} aria-label="Writing stage">
                {(["write", "feedback", "improve"] as const).map((stage) => (
                  <button
                    key={stage}
                    aria-pressed={tab === stage}
                    onClick={() => setTab(stage)}
                  >
                    {stage[0].toUpperCase() + stage.slice(1)}
                  </button>
                ))}
              </div>
              <div className={`${styles.layout} ${styles.spaced}`}>
                <section className={styles.canvas} aria-label="Writing canvas">
                  {tab === "write" ? (
                    <>
                      <label className={styles.label} htmlFor="writing-editor">
                        Your English text
                      </label>
                      <textarea
                        id="writing-editor"
                        ref={textarea}
                        className={styles.editor}
                        aria-describedby="writing-privacy"
                        maxLength={WRITING_LIMITS.text}
                        value={editor}
                        disabled={Boolean(selected.archivedAt) || conflicted}
                        onChange={(event) => {
                          const next = event.target.value;
                          editing.current.text = next;
                          setEditor(next);
                          setError("");
                        }}
                        onCompositionStart={() => setComposing(true)}
                        onCompositionEnd={() => setComposing(false)}
                        onKeyDown={(event) => {
                          if (
                            (event.ctrlKey || event.metaKey) &&
                            event.key.toLowerCase() === "s"
                          ) {
                            event.preventDefault();
                            void saveCurrent();
                          }
                        }}
                        placeholder={
                          selected.kind === "email"
                            ? "Who are you writing to? What would you like them to know?"
                            : selected.kind === "essay"
                              ? "Start with the idea you want to explore…"
                              : "Put a thought into words…"
                        }
                      />
                      <p id="writing-privacy" className={styles.caption}>
                        {editor.trim() ? editor.trim().split(/\s+/u).length : 0}{" "}
                        words · {editor.length.toLocaleString()} /{" "}
                        {WRITING_LIMITS.text.toLocaleString()} characters ·
                        Local autosave. No cloud backup or AI evaluation.
                      </p>
                    </>
                  ) : tab === "feedback" ? (
                    <div className={styles.panel}>
                      <h2>Feedback is under your control.</h2>
                      <p>
                        AI feedback is awaiting provider configuration. Your
                        writing has not been sent or graded.
                      </p>
                      <p className={styles.notice}>
                        A useful self-review: Is your meaning clear? Does each
                        verb match its subject? Would one concrete example help
                        the reader?
                      </p>
                      <p>
                        You can study an authored grammar rule beside a selected
                        excerpt. Opening a rule does not mark your writing as
                        correct or create writing evidence.
                      </p>
                      <button
                        className="button secondary"
                        onClick={() => {
                          void openGrammar();
                        }}
                      >
                        Study a rule with this draft <ArrowUpRight size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className={styles.panel}>
                      <h2>Improve it yourself.</h2>
                      <p>
                        Your original and earlier revisions stay available.
                        Return to Write to revise; a restored version is saved
                        as a new revision.
                      </p>
                      {diff ? (
                        <>
                          <h3>Changes since the selected version</h3>
                          <p className={styles.diff}>
                            {diff.prefix}
                            <del>{diff.removed}</del>
                            <ins>{diff.added}</ins>
                            {diff.suffix}
                          </p>
                        </>
                      ) : (
                        <p className="muted">
                          Choose Compare on a previous version to see the
                          changes.
                        </p>
                      )}
                      <button
                        className="button secondary"
                        onClick={() => setTab("write")}
                      >
                        Return to writing
                      </button>
                    </div>
                  )}
                </section>
                <aside className={styles.aside}>
                  <section className={styles.panel}>
                    <h2>A rule, in context.</h2>
                    <label className={styles.label}>
                      Grammar topic
                      <select
                        value={conceptId}
                        onChange={(event) => setConceptId(event.target.value)}
                      >
                        {GRAMMAR_CONCEPTS.map((concept) => (
                          <option key={concept.id} value={concept.id}>
                            {concept.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className={styles.caption}>
                      Select a passage in Write, then open a rule. Only the
                      selected excerpt, or a short passage around the cursor,
                      stays in this tab for 30 minutes.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        void openGrammar();
                      }}
                      disabled={
                        saving || conflicted || Boolean(selected.archivedAt)
                      }
                    >
                      Open Grammar Atlas <ArrowUpRight size={16} />
                    </button>
                  </section>
                  <section className={styles.panel}>
                    <h2>Version history</h2>
                    <p className={styles.caption}>
                      Every saved change has its own revision. Restoring adds a
                      new version; it does not erase earlier writing.
                    </p>
                    {selected.revisions
                      .slice(-visibleRevisions)
                      .reverse()
                      .map((revision, index) => (
                        <details key={revision.id} className={styles.revision}>
                          <summary>
                            {index === 0
                              ? "Latest saved"
                              : revision.parentId === null
                                ? "Original"
                                : "Earlier version"}{" "}
                            ·{" "}
                            {new Date(revision.createdAt).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </summary>
                          <pre>{revision.text || "Empty draft"}</pre>
                          <div className={styles.actions}>
                            <button
                              className="button ghost small"
                              onClick={() => {
                                setPreviewRevisionId(revision.id);
                                setTab("improve");
                              }}
                            >
                              Compare
                            </button>
                            <button
                              className="button secondary small"
                              disabled={
                                saving ||
                                conflicted ||
                                Boolean(selected.archivedAt) ||
                                revision.id === selected.headId
                              }
                              onClick={() => {
                                void restoreRevision(revision.id);
                              }}
                            >
                              Restore as new version
                            </button>
                          </div>
                        </details>
                      ))}
                    {selected.revisions.length > visibleRevisions && (
                      <button
                        className="button ghost small"
                        onClick={() =>
                          setVisibleRevisions((value) => value + 20)
                        }
                      >
                        Show earlier versions
                      </button>
                    )}
                    <button
                      className="button ghost small"
                      disabled={saving || conflicted}
                      onClick={() => {
                        void archiveSelected();
                      }}
                    >
                      {selected.archivedAt
                        ? "Restore archived draft"
                        : "Archive draft"}
                    </button>
                  </section>
                </aside>
              </div>
            </>
          )}
        </>
      )}
      {workspace && (
        <section
          id="writing-backup"
          className={`${styles.panel} ${styles.spaced}`}
          aria-label="Writing backup and restore"
        >
          <h2>Keep a copy. Bring it back.</h2>
          <p className={styles.caption}>
            Restore a versioned writing JSON backup with a preview. New drafts
            and revisions are merged by their original IDs; competing versions
            remain available for review. This local workspace belongs to this
            browser, with no cloud backup. File limit: 64 MB.
          </p>
          <input
            ref={restoreInput}
            hidden
            type="file"
            accept=".json,application/json"
            aria-label="Choose writing backup"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void prepareRestore(file);
            }}
          />
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => restoreInput.current?.click()}
          >
            Restore writing backup
          </button>
        </section>
      )}
      <Modal
        open={Boolean(restorePreview)}
        onClose={() => {
          if (!saving) setRestorePreview(null);
        }}
        title="Preview writing restore"
      >
        {restorePreview && (
          <div className={styles.form}>
            <p>
              {restorePreview.newDrafts} new{" "}
              {restorePreview.newDrafts === 1 ? "draft" : "drafts"},{" "}
              {restorePreview.newRevisions} new{" "}
              {restorePreview.newRevisions === 1 ? "revision" : "revisions"}.
              Existing originals and saved versions are preserved.
            </p>
            <p>
              {restorePreview.conflictDraftIds.length
                ? `${restorePreview.conflictDraftIds.length} drafts will have competing versions to review. The restore does not choose between them.`
                : "No competing version branches were found."}
            </p>
            <p className={styles.caption}>
              Matching IDs are merged once. Local titles and archive choices are
              kept for existing drafts. No practice observation or language
              score is created.
            </p>
            {restoreError && <p role="alert">{restoreError}</p>}
            <div className={styles.actions}>
              <button
                className="button primary"
                onClick={() => {
                  void restoreBackup();
                }}
                disabled={saving}
              >
                Confirm writing restore
              </button>
              <button
                className="button ghost"
                onClick={() => setRestorePreview(null)}
                disabled={saving}
              >
                Keep current writing
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="A new piece of writing"
      >
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void createDraft();
          }}
        >
          <label className={styles.label}>
            Title
            <input
              autoComplete="off"
              maxLength={160}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="An idea to explore"
            />
          </label>
          <label className={styles.label}>
            Format
            <select
              value={newKind}
              onChange={(event) =>
                setNewKind(event.target.value as WritingKind)
              }
            >
              <option value="free">Free writing</option>
              <option value="email">Email</option>
              <option value="essay">Essay</option>
              <option value="goal">My own goal</option>
            </select>
          </label>
          <p className={styles.caption}>
            This draft stays in this browser. No external evaluation or cloud
            storage is connected.
          </p>
          <div className={styles.actions}>
            <button type="submit" className="button primary" disabled={saving}>
              Create draft
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setNewOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
