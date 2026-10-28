"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/shell";
import {
  PROFILE_BACKUP_LIMITS,
  type ProfileJsonSectionId,
} from "@/domain/profile-backup";
import type { ProfileRestoreMarker } from "@/domain/profile-recovery";
import {
  inspectBrowserProfile,
  exportBrowserProfile,
  openBrowserProfileBackup,
  previewBrowserProfileRestore,
  browserProfileRestoreCoordinator,
  type BrowserProfileInventory,
  type BrowserProfileRestorePreview,
} from "@/infrastructure/profile/browser-backup";
import type { OpenProfileBackupContainer } from "@/infrastructure/profile/container";
import {
  PROFILE_RESTORE_EVENT,
  PROFILE_RESTORE_KEY,
  readProfileRestoreMarker,
} from "@/infrastructure/profile/operation";
import styles from "./settings.module.css";

const names: Record<ProfileJsonSectionId, string> = {
  learning: "Saved meanings and observations",
  tasks: "Tasks, FSRS and challenges",
  materials: "Books, bookmarks and import batches",
  catalog: "Your dictionary definitions",
  "sense-contexts": "Saved passages",
  goals: "Goals",
  preferences: "Learning preferences",
  "reader-preferences": "Reader appearance",
  "practice-session": "Practice position",
  "tutor-local": "Local Tutor conversations",
  writing: "Writing drafts and revisions",
  "media-metadata": "Recordings, transcripts and listening positions",
};
const countNames: Record<string, readonly [string, string]> = {
  meanings: ["meaning", "meanings"],
  observations: ["observation", "observations"],
  tasks: ["task", "tasks"],
  attempts: ["attempt", "attempts"],
  challenges: ["challenge", "challenges"],
  reviewItems: ["scheduled item", "scheduled items"],
  reviews: ["review", "reviews"],
  documents: ["document", "documents"],
  chapters: ["chapter", "chapters"],
  bookmarks: ["bookmark", "bookmarks"],
  batches: ["import batch", "import batches"],
  rows: ["import row", "import rows"],
  lexemes: ["dictionary entry", "dictionary entries"],
  passages: ["passage", "passages"],
  goals: ["goal", "goals"],
  settings: ["preference set", "preference sets"],
  sessions: ["session", "sessions"],
  conversations: ["conversation", "conversations"],
  messages: ["message", "messages"],
  pendingRequests: ["pending request", "pending requests"],
  drafts: ["draft", "drafts"],
  revisions: ["revision", "revisions"],
  conflicts: ["revision conflict", "revision conflicts"],
  recordings: ["recording", "recordings"],
};
const describe = (counts: Record<string, number>) =>
  Object.entries(counts)
    .map(
      ([label, count]) =>
        `${count} ${countNames[label]?.[count === 1 ? 0 : 1] ?? label.replace(/([a-z])([A-Z])/gu, "$1 $2").toLowerCase()}`,
    )
    .join(" · ") || "No saved records";
const errorMessage = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "This operation could not be completed. Saved source data is preserved.";
function download(file: Blob) {
  const url = URL.createObjectURL(file),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lexis-profile-${new Date().toISOString().slice(0, 10)}.lexis`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ProfileBackup() {
  const [inventory, setInventory] = useState<BrowserProfileInventory | null>(
    null,
  );
  const [exportIds, setExportIds] = useState<ProfileJsonSectionId[]>([]);
  const [file, setFile] = useState<OpenProfileBackupContainer | null>(null);
  const [restoreIds, setRestoreIds] = useState<ProfileJsonSectionId[]>([]);
  const [preview, setPreview] = useState<BrowserProfileRestorePreview | null>(
    null,
  );
  const [marker, setMarker] = useState<ProfileRestoreMarker | null>(null);
  const [settings, setSettings] = useState<"keep-current" | "incoming">(
    "keep-current",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [partialConfirmed, setPartialConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Inspecting saved data…"),
    [error, setError] = useState("");
  const active = useRef(false),
    controller = useRef<AbortController | null>(null);

  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError("");
    const next = new AbortController();
    controller.current = next;
    try {
      await action(next.signal);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      active.current = false;
      controller.current = null;
      setBusy(false);
      try {
        setMarker(readProfileRestoreMarker());
      } catch (cause) {
        setError(errorMessage(cause));
      }
    }
  }
  useEffect(() => {
    let mounted = true;
    const loadMarker = () => {
      if (mounted)
        try {
          setMarker(readProfileRestoreMarker());
        } catch (cause) {
          setError(errorMessage(cause));
        }
    };
    loadMarker();
    const initial = new AbortController();
    void inspectBrowserProfile({ signal: initial.signal })
      .then((value) => {
        if (!mounted) return;
        setInventory(value);
        setExportIds(
          value.sections
            .filter((item) => item.status !== "unavailable")
            .map((item) => item.id),
        );
        setStatus("Choose what to keep in your copy.");
      })
      .catch((cause) => {
        if (mounted) setError(errorMessage(cause));
      });
    const storage = (event: StorageEvent) => {
      if (event.key === PROFILE_RESTORE_KEY) loadMarker();
    };
    window.addEventListener(PROFILE_RESTORE_EVENT, loadMarker);
    window.addEventListener("storage", storage);
    return () => {
      mounted = false;
      initial.abort();
      controller.current?.abort();
      window.removeEventListener(PROFILE_RESTORE_EVENT, loadMarker);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const toggle = (
    ids: ProfileJsonSectionId[],
    id: ProfileJsonSectionId,
    checked: boolean,
  ) => (checked ? [...ids, id] : ids.filter((item) => item !== id));
  const progress = (value: {
    phase: string;
    completedParts?: number;
    totalParts?: number;
    completed?: number;
    total?: number;
  }) =>
    setStatus(
      `${value.phase} · ${value.completedParts ?? value.completed ?? 0} / ${value.totalParts ?? value.total ?? 0}`,
    );
  const finished =
    marker &&
    ["complete", "cancelled", "partial-accepted"].includes(marker.status);
  const restoreSections =
    file?.manifest.parts.flatMap((part) =>
      part.kind === "json" ? [part.section] : [],
    ) ?? [];
  return (
    <Shell title="Profile backup">
      <div className="page-heading">
        <p className="eyebrow">KEEP YOUR WORK</p>
        <h1>A copy you can return to.</h1>
        <p>
          Export this browser’s local profile, then review a merge before
          restoring. Files stay on your device; nothing is uploaded.
        </p>
      </div>
      <div className={styles.stack}>
        <p role="status" data-testid="profile-operation-status">
          {status}
        </p>
        {error && (
          <div role="alert">
            <p>{error}</p>
            <p>
              Keep the original file. Save or copy unsaved work in other tabs
              before retrying.
            </p>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => window.location.reload()}
            >
              Reload preserved profile
            </button>
          </div>
        )}
        {busy && (
          <button
            className="button secondary"
            onClick={() => controller.current?.abort()}
          >
            Stop current operation
          </button>
        )}
        {marker && (
          <section
            className={`glass-panel ${styles.panel}`}
            aria-label="Recorded restoration"
          >
            <h2>
              {marker.status === "complete"
                ? "Your selected data has been verified."
                : "A recorded restoration"}
            </h2>
            <p>
              {marker.completed.length} of {marker.steps.length} steps confirmed
              · {marker.status}. Ordinary editing stays paused until you reopen
              the profile.
            </p>
            <p>
              These stores are restored in separate steps. A stopped operation
              may have saved a step before its receipt; resuming checks the
              actual data and does not repeat it.
            </p>
            <div className={styles.actions}>
              {!finished && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async (signal) => {
                      const result =
                        await browserProfileRestoreCoordinator().resume(
                          marker.id,
                          { signal, onProgress: progress },
                        );
                      setMarker(result);
                      setStatus(
                        "All selected data verified. Open the restored profile to continue.",
                      );
                    })
                  }
                >
                  Resume restoration
                </button>
              )}
              {marker.status === "staged" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      setMarker(
                        await browserProfileRestoreCoordinator().cancelBeforeWrites(
                          marker.id,
                        ),
                      );
                      setStatus(
                        "Restoration cancelled before any selected step was applied.",
                      );
                    })
                  }
                >
                  Cancel before applying
                </button>
              )}
              {finished && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await browserProfileRestoreCoordinator().releaseFinished(
                        marker.id,
                      );
                      // A full navigation discards every paused in-memory workspace and epoch guard.
                      window.location.assign(
                        new URL("/settings/backup", window.location.origin)
                          .href,
                      );
                    })
                  }
                >
                  Open restored profile
                </button>
              )}
            </div>
            {marker.status === "partial" && (
              <details>
                <summary>Keep the partial result instead</summary>
                <p>
                  This does not complete the restoration or undo applied
                  changes. Keep the backup to restore the remaining data later.
                  A step without a receipt may already be saved.
                </p>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={partialConfirmed}
                    onChange={(event) =>
                      setPartialConfirmed(event.target.checked)
                    }
                  />
                  I understand that this leaves an incomplete restoration.
                </label>
                <button
                  className="button secondary"
                  disabled={busy || !partialConfirmed}
                  onClick={() =>
                    void perform(async () => {
                      setMarker(
                        await browserProfileRestoreCoordinator().acceptPartial(
                          marker.id,
                        ),
                      );
                      setStatus(
                        "Partial result explicitly kept. This is not a completed restoration.",
                      );
                    })
                  }
                >
                  Keep partial result
                </button>
              </details>
            )}
          </section>
        )}
        {!marker && (
          <>
            <section
              className={`glass-panel ${styles.panel}`}
              aria-label="Export local profile"
            >
              <h2>Keep a private copy.</h2>
              <p>
                The file is not encrypted. It can contain books, answers,
                transcripts and drafts. Store it privately. Account credentials,
                server data, temporary context permissions and offline caches
                are excluded.
              </p>
              <fieldset className={styles.selection} disabled={busy}>
                <legend>Sections to export</legend>
                {inventory?.sections.map((item) => (
                  <label className={styles.check} key={item.id}>
                    <input
                      type="checkbox"
                      data-testid={`profile-export-${item.id}`}
                      checked={exportIds.includes(item.id)}
                      disabled={item.status === "unavailable"}
                      onChange={(event) =>
                        setExportIds(
                          toggle(exportIds, item.id, event.target.checked),
                        )
                      }
                    />
                    <span>
                      {names[item.id]}
                      <small className={styles.description}>
                        {item.status === "opaque"
                          ? "Unvalidated original — export for recovery only"
                          : item.status === "unavailable"
                            ? "Unavailable — not included"
                            : describe(item.counts)}
                        {item.error && ` · ${item.error}`}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                className="button primary"
                disabled={busy || !inventory || !exportIds.length}
                onClick={() =>
                  void perform(async (signal) => {
                    setStatus("Preparing your selected copy…");
                    const result = await exportBrowserProfile(
                      { sections: exportIds },
                      { signal, onProgress: progress },
                    );
                    download(result);
                    setStatus(
                      "Your selected copy is ready to save. Keep the .lexis file privately and verify a restore before relying on it.",
                    );
                  })
                }
              >
                Export selected profile
              </button>
              <p className={styles.note}>
                Books contain the imported readable chapters, not the original
                EPUB archive. Media includes locally stored user-provided files;
                a past import is not proof of content rights. Browser storage
                may be evicted, so keep copies elsewhere.
              </p>
            </section>
            <section
              className={`glass-panel ${styles.panel}`}
              aria-label="Restore local profile"
            >
              <h2>Review before bringing it back.</h2>
              <p>
                A merge keeps existing history and original IDs. Conflicting
                identities are blocked. Writing branches remain available for
                you to compare. Missing definitions and sources remain
                unavailable rather than being linked to a different meaning.
              </p>
              <label className={styles.field}>
                Backup file
                <input
                  className={styles.input}
                  type="file"
                  accept=".lexis,application/vnd.lexis.profile"
                  disabled={busy || !!marker}
                  onChange={(event) => {
                    const chosen = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!chosen) return;
                    setFile(null);
                    setPreview(null);
                    setConfirmed(false);
                    void perform(async (signal) => {
                      setStatus("Checking file integrity…");
                      const opened = await openBrowserProfileBackup(chosen, {
                        signal,
                        onProgress: progress,
                      });
                      setFile(opened);
                      setRestoreIds(
                        opened.manifest.parts.flatMap((part) =>
                          part.kind === "json" ? [part.section] : [],
                        ),
                      );
                      setStatus(
                        "File verified. Choose sections and preview their merge.",
                      );
                    });
                  }}
                />
              </label>
              <p className={styles.note}>
                Supported local backup v1 · at most{" "}
                {PROFILE_BACKUP_LIMITS.maxFileBytes / 1024 / 1024} MiB per file,
                25 MiB per recording, 10 recordings. Older per-module JSON
                exports remain available in their original workspaces.
              </p>
              {file && (
                <>
                  <p>
                    Created {file.manifest.createdAt.slice(0, 10)} ·{" "}
                    {restoreSections.length} sections. File checksums detect
                    damage; they do not establish who created a file.
                  </p>
                  <fieldset
                    className={styles.selection}
                    disabled={busy || !!marker}
                  >
                    <legend>Sections to restore</legend>
                    {restoreSections.map((id) => (
                      <label className={styles.check} key={id}>
                        <input
                          type="checkbox"
                          data-testid={`profile-restore-${id}`}
                          checked={restoreIds.includes(id)}
                          onChange={(event) => {
                            setRestoreIds(
                              toggle(restoreIds, id, event.target.checked),
                            );
                            setPreview(null);
                            setConfirmed(false);
                          }}
                        />
                        {names[id]}
                      </label>
                    ))}
                  </fieldset>
                  <label className={styles.field}>
                    Settings during restore
                    <select
                      className={styles.select}
                      value={settings}
                      disabled={busy || !!marker}
                      onChange={(event) => {
                        setSettings(event.target.value as typeof settings);
                        setPreview(null);
                        setConfirmed(false);
                      }}
                    >
                      <option value="keep-current">
                        Keep this device’s settings
                      </option>
                      <option value="incoming">
                        Use settings from this backup
                      </option>
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    disabled={busy || !!marker || !restoreIds.length}
                    onClick={() =>
                      void perform(async (signal) => {
                        const result = await previewBrowserProfileRestore(
                          file,
                          { sections: restoreIds, settings },
                          { signal },
                        );
                        setPreview(result);
                        setConfirmed(false);
                        setStatus(
                          result.rows.some((row) => row.conflict)
                            ? "Resolve conflicts or exclude those sections, then preview again."
                            : "Review the selected merge before confirming.",
                        );
                      })
                    }
                  >
                    Preview selected sections
                  </button>
                </>
              )}
              {preview && (
                <div className={styles.divider} data-testid="profile-preview">
                  <h3>Your selected merge</h3>
                  <ul className={styles.list}>
                    {preview.rows.map((row) => (
                      <li key={row.id}>
                        <strong>{names[row.id]}</strong> ·{" "}
                        {row.conflict
                          ? "Blocked"
                          : row.changed
                            ? "Add / merge"
                            : "Keep unchanged"}
                        <p>{row.conflict ?? describe(row.counts)}</p>
                        {row.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </li>
                    ))}
                  </ul>
                  {preview.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  <p>
                    Save or copy text in other LEXIS tabs first. Pending Tutor
                    requests will be cancelled; restoring conversations does not
                    renew permission to send private context. This operation
                    never deletes missing items or creates new learning
                    evidence.
                  </p>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={busy || !!marker}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    I have saved my work and reviewed this merge.
                  </label>
                  <button
                    className="button primary"
                    disabled={busy || !!marker || !confirmed || !preview.marker}
                    onClick={() =>
                      void perform(async (signal) => {
                        if (!preview.marker) return;
                        const result =
                          await browserProfileRestoreCoordinator().start(
                            {
                              marker: preview.marker,
                              payloads: preview.payloads,
                            },
                            { signal, onProgress: progress },
                          );
                        setMarker(result);
                        setStatus(
                          "All selected data verified. Open the restored profile to continue.",
                        );
                      })
                    }
                  >
                    Restore reviewed sections
                  </button>
                </div>
              )}
            </section>
          </>
        )}
        <Link href="/settings" className="text-button">
          Back to settings
        </Link>
      </div>
    </Shell>
  );
}
