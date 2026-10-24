"use client";
import Link from "next/link";
import { useState } from "react";
import {
  previewLearningRestore,
  type LearningRestorePreview,
} from "@/domain/restore";
import { STORAGE_KEY } from "@/infrastructure/storage/browser-repository";
import { Shell } from "./shell";
import { useLearning } from "./learning-provider";

export function DataRestore() {
  const { state, ready, error: storageError, restore } = useLearning();
  const [raw, setRaw] = useState<string | null>(null);
  const [preview, setPreview] = useState<LearningRestorePreview | null>(null);
  const [error, setError] = useState("");
  const [backedUp, setBackedUp] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(false);
  function backup() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      const url = URL.createObjectURL(
        new Blob([current ?? JSON.stringify(state)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "lexis-before-restore.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setBackedUp(JSON.stringify(state));
      setError("");
    } catch {
      setError("A backup could not be downloaded. Nothing has been changed.");
    }
  }
  return (
    <Shell title="Core">
      <div className="page-heading">
        <p className="eyebrow">YOUR DATA</p>
        <h1>Bring your history back.</h1>
        <p className="intro-copy">
          Restore a LEXIS local learning v1 backup. Preview first; your existing
          history stays intact.
        </p>
      </div>
      <section
        className="glass-panel empty-state"
        aria-label="Learning backup restore"
      >
        <h2>Learning history backup</h2>
        <p>
          This restores saved meanings, self-ratings, exclusions and the sample
          reading position. Separate books, writing drafts and practice backups
          use their own tools; they are not included in this file.
        </p>
        <p className="muted">
          JSON only, up to 50 MB. Processed on this device. Different meanings
          and observations are merged by their original IDs; conflicts block the
          restore. The furthest sample reading position is kept.
        </p>
        <label className="button secondary">
          Choose learning backup
          <input
            type="file"
            accept="application/json,.json"
            disabled={!ready || loading || Boolean(storageError)}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              setPreview(null);
              setRaw(null);
              setError("");
              setBackedUp(null);
              setRestored(false);
              if (!file) return;
              if (file.size > 50 * 1024 * 1024) {
                setError(
                  "This backup exceeds the 50 MB restore limit. Nothing has changed.",
                );
                return;
              }
              setLoading(true);
              try {
                const text = await file.text();
                const next = previewLearningRestore(state, JSON.parse(text));
                setRaw(text);
                setPreview(next);
              } catch {
                setError(
                  "This is not a valid supported learning backup. Your existing data has not changed.",
                );
              } finally {
                setLoading(false);
              }
            }}
          />
        </label>
        {loading && <p role="status">Checking the backup…</p>}
        {(error || storageError) && <p role="alert">{error || storageError}</p>}
        {preview && (
          <div>
            <h3>Preview</h3>
            <p>
              {preview.incoming.saved.length} saved meanings ·{" "}
              {preview.incoming.evidence.length} observations in this backup.
            </p>
            <p>
              {preview.addedMeanings} new meanings · {preview.addedObservations}{" "}
              new observations · {preview.duplicateObservations} already present
              observations.
            </p>
            {preview.conflicts.length ? (
              <div role="alert">
                <p>
                  Some IDs have different contexts or observation contents.
                  Restore is blocked so both versions remain safe. Keep the
                  source file for a separate profile or resolve the differences
                  first.
                </p>
                <ul>
                  {preview.conflicts.slice(0, 20).map((conflict) => (
                    <li key={`${conflict.kind}:${conflict.id}`}>
                      {conflict.kind}: {conflict.id}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="device-actions">
                <button className="button secondary" onClick={backup}>
                  Download current backup
                </button>
                <button
                  className="button primary"
                  disabled={
                    backedUp !== JSON.stringify(state) ||
                    restored ||
                    Boolean(storageError)
                  }
                  onClick={() => {
                    if (!raw || backedUp !== JSON.stringify(state)) return;
                    try {
                      const next = previewLearningRestore(
                        state,
                        JSON.parse(raw),
                      );
                      if (!next.merged) {
                        setPreview(next);
                        setError(
                          "The data changed. Review the new conflicts before continuing.",
                        );
                        return;
                      }
                      if (restore(next.merged)) {
                        setRestored(true);
                        setError("");
                      }
                    } catch {
                      setError(
                        "Restore could not be completed. The original backup file is unchanged.",
                      );
                    }
                  }}
                >
                  Confirm merge
                </button>
              </div>
            )}
          </div>
        )}
        {restored && (
          <p role="status">
            Learning history restored on this device. Original IDs and excluded
            observations have been preserved.
          </p>
        )}
        <Link href="/core" className="text-link">
          Return to Core
        </Link>
      </section>
    </Shell>
  );
}
