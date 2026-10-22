"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Download, Info, RotateCcw, Check } from "lucide-react";
import { SKILLS, deriveProgress, SCHEDULER_VERSION } from "@/domain";
import { seedEntries } from "@/infrastructure/dictionary/seed";
import { STORAGE_KEY } from "@/infrastructure/storage/browser-repository";
import { Shell } from "./shell";
import { Orb } from "./orb";
import { Modal } from "./modal";
import { useLearning } from "./learning-provider";

const labels = {
  recognition: "Recognition",
  context: "Understanding in context",
  recall: "Active recall",
  writing: "Writing",
  speaking: "Speaking",
};
export function Core() {
  const { state, dispute, reset, ready } = useLearning();
  const [resetOpen, setResetOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const progress = deriveProgress(state);
  function exportBackup() {
    try {
      const raw =
        window.localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(state);
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "lexis-local-backup.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportError("");
    } catch {
      setExportError(
        "Your browser could not export this data. Try allowing local storage.",
      );
    }
  }
  return (
    <Shell title="Core">
      <div className="page-heading">
        <p className="eyebrow">LIVING CORE</p>
        <h1>
          Understanding,
          <br />
          <span>in its own time.</span>
        </h1>
        <p className="intro-copy">
          A meaning is more than a word. Knowing it is more than a score.
        </p>
      </div>
      <section className="core-overview glass-panel">
        <div className="core-overview-visual">
          <Orb />
        </div>
        <div>
          <p className="eyebrow">FIVE SKILLS. ONE CONNECTED PICTURE.</p>
          <h2>
            {state.saved.length
              ? `${state.saved.length} meanings taking shape.`
              : "A new understanding begins here."}
          </h2>
          <p className="muted">
            Your Core keeps each meaning and each skill separate. Saving a
            meaning shows interest; practice adds evidence of understanding.
          </p>
          <Link className="text-link" href="/reader">
            Add an encounter
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </section>
      <section className="skills-panel">
        <div className="section-heading">
          <h2>What the evidence says</h2>
          <span className="tiny muted">SELF-REPORTED PRACTICE</span>
        </div>
        <div className="skills-list">
          {SKILLS.map((skill) => {
            const rows = progress.filter(
              (row) => row.skill === skill && row.attempts > 0,
            );
            const score = rows.length
              ? Math.round(
                  rows.reduce((sum, row) => sum + row.score, 0) / rows.length,
                )
              : null;
            return (
              <div className="skill-row" key={skill}>
                <span className="skill-dot" />
                <h3>{labels[skill]}</h3>
                <span>
                  {rows.length
                    ? `${rows.length} ${rows.length === 1 ? "meaning" : "meanings"} practised`
                    : "No practice evidence yet"}
                </span>
                <span
                  className="skill-estimate"
                  aria-label={`${labels[skill]} estimate`}
                >
                  {score === null ? "—" : "Tentative"}
                </span>
              </div>
            );
          })}
        </div>
        <p className="explanation-note">
          <Info size={16} />
          These tentative signals come from your own recognition ratings using{" "}
          {SCHEDULER_VERSION}. They do not measure proficiency. Other skills
          need their own exercises; no probability of mastery is inferred.
        </p>
      </section>
      <section>
        <div className="section-heading">
          <h2>Your practice trail</h2>
          <Link className="text-link" href="/learn">
            Smart Review
            <ArrowUpRight size={14} />
          </Link>
        </div>
        {state.evidence.length ? (
          <div className="evidence-list glass-panel">
            {[...state.evidence].reverse().map((item) => {
              const entry = seedEntries.find((entry) =>
                entry.senses.some((sense) => sense.id === item.senseId),
              );
              const sense = entry?.senses.find(
                (sense) => sense.id === item.senseId,
              );
              return (
                <div className="evidence-row" key={item.id}>
                  <div>
                    <strong>{entry?.lexeme.lemma ?? item.senseId}</strong>
                    {sense && <p>{sense.definition}</p>}
                    <p>
                      {labels[item.skill]} · self-rating: {item.rating}
                    </p>
                    <span className="tiny muted">
                      {new Date(item.occurredAt).toLocaleString()} ·{" "}
                      {item.source}
                    </span>
                  </div>
                  {item.disputedAt ? (
                    <span className="disputed-label">
                      <Check size={14} />
                      Excluded from estimates
                    </span>
                  ) : (
                    <button
                      className="button ghost small"
                      onClick={() => dispute(item.id)}
                    >
                      <RotateCcw size={14} />
                      Dispute this rating
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <p>
              No ratings yet. A saved meaning and one thoughtful review are a
              good place to begin.
            </p>
          </div>
        )}
      </section>
      <section className="device-panel glass-panel">
        <div>
          <h2>Your data, on this device.</h2>
          <p className="muted">
            No account or cloud backup is connected. Browser storage can be
            cleared by the browser. Export a copy before resetting or changing
            devices. Backup import is not available yet.
          </p>
          {exportError && <p role="alert">{exportError}</p>}
        </div>
        <div className="device-actions">
          <button
            className="button secondary"
            onClick={exportBackup}
            disabled={!ready}
          >
            <Download size={16} />
            Export local data
          </button>
          <button
            className="button ghost"
            onClick={() => setResetOpen(true)}
            disabled={!ready}
          >
            Reset this device
          </button>
        </div>
      </section>
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset this device?"
      >
        <p>
          This removes your saved meanings, ratings and reading position from
          this browser. Export a backup first if you want to keep a copy.
        </p>
        <div className="modal-actions">
          <button
            className="button secondary"
            onClick={() => setResetOpen(false)}
          >
            Keep my data
          </button>
          <button
            className="button danger"
            onClick={() => {
              if (reset()) setResetOpen(false);
            }}
          >
            Remove local data
          </button>
        </div>
      </Modal>
    </Shell>
  );
}
