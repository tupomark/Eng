"use client";
import { subscribeToProfileRestore } from "@/infrastructure/materials/purge-signal";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Shell } from "./shell";
import { Modal } from "./modal";
import { useLearning } from "./learning-provider";
import { useTaskLearning } from "./task-learning-provider";
import {
  addGoal,
  emptyGoalState,
  goalProgress,
  previewGoalRestore,
  reviseGoal,
  suggestGoalLoad,
  type GoalState,
  type GoalSuggestion,
  type LearningGoal,
} from "@/domain/knowledge/goals";
import {
  buildObservationTrail,
  OBSERVATORY_SKILLS,
} from "@/domain/knowledge/observatory";
import {
  BrowserGoalRepository,
  GOALS_STORAGE_KEY,
} from "@/infrastructure/storage/browser-goals";
import { knowledgeSkillLabels } from "./knowledge-labels";
import styles from "./knowledge-workspaces.module.css";
import {
  assertLocalWritesAllowed,
  suspendLocalWrites,
} from "@/infrastructure/storage/local-write-guard";

export function LearningGoals() {
  const learning = useLearning();
  const tasks = useTaskLearning();
  const [state, setState] = useState<GoalState>(emptyGoalState);
  const snapshot = useRef<string | null>(null);
  const repository = useRef<BrowserGoalRepository | null>(null);
  const [ready, setReady] = useState(false);
  const [readable, setReadable] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [proposal, setProposal] = useState<GoalSuggestion | null>(null);
  const [editing, setEditing] = useState<LearningGoal | null>(null);
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState<LearningGoal["term"]>("short");
  const [domain, setDomain] = useState("General English");
  const [skill, setSkill] = useState<LearningGoal["skill"]>("any");
  const [measure, setMeasure] = useState<LearningGoal["measure"]>(
    "independent-attempts",
  );
  const [cadence, setCadence] = useState<LearningGoal["cadence"]>("7-days");
  const [target, setTarget] = useState(5);
  const [resetOpen, setResetOpen] = useState(false);
  const [restore, setRestore] = useState<{
    base: string | null;
    state: GoalState;
    incoming: number;
    added: number;
  } | null>(null);
  const rows = useMemo(
    () => buildObservationTrail(learning.state, tasks.state),
    [learning.state, tasks.state],
  );
  const load = useCallback(() => {
    try {
      assertLocalWritesAllowed(window.localStorage);
      repository.current ??= new BrowserGoalRepository(window.localStorage);
      const loaded = repository.current.read();
      snapshot.current = loaded.serialized;
      setState(loaded.state);
      setReadable(true);
      setError("");
    } catch {
      setReadable(false);
      setError(
        "Your local goals could not be opened. The original data is preserved. Export a backup before recovery, or reload to try again.",
      );
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    load();
    const sync = (event: StorageEvent) => {
      if (event.key === GOALS_STORAGE_KEY || event.key === null) load();
    };
    const purge = () => {
      suspendLocalWrites();
      repository.current = null;
      setState(emptyGoalState());
      setReadable(false);
      setEditing(null);
      setProposal(null);
      setRestore(null);
      setError(
        "Goals are paused for local profile deletion. Finish in Settings, then start fresh.",
      );
    };
    window.addEventListener("storage", sync);
    window.addEventListener("lexis-local-purge", purge);
    const stopRestore = subscribeToProfileRestore(() => {
      repository.current = null;
      setReadable(false);
      setRestore(null);
      setError(
        "Goals are paused for profile recovery. Your visible goal and input remain here. Finish recovery, then reopen LEXIS.",
      );
    });
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lexis-local-purge", purge);
      stopRestore();
    };
  }, [load]);
  function commit(next: GoalState) {
    if (!readable || !repository.current) {
      setError("Reload your preserved goals before making changes.");
      return false;
    }
    try {
      snapshot.current = repository.current.commit(next, snapshot.current);
      setState(next);
      setError("");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error && /another tab/.test(cause.message)
          ? cause.message
          : "This goal could not be saved. Your previous goals are intact; check browser storage and retry.",
      );
      return false;
    }
  }
  function clearForm() {
    setEditing(null);
    setTitle("");
    setTerm("short");
    setDomain("General English");
    setSkill("any");
    setMeasure("independent-attempts");
    setCadence("7-days");
    setTarget(5);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const now = new Date().toISOString();
      const changes = {
        title: title.trim(),
        term,
        domain: domain.trim(),
        skill,
        measure,
        cadence,
        targetCount: target,
      };
      const next = editing
        ? reviseGoal(state, editing.id, editing.revision, changes, now)
        : addGoal(state, {
            ...changes,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            revision: 1,
            archived: false,
          });
      if (commit(next)) {
        clearForm();
        setStatus(
          editing
            ? "Your goal was updated by your choice."
            : "Goal saved. Progress begins with eligible practice from now on.",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This goal could not be prepared. Your input is preserved.",
      );
    }
  }
  function edit(goal: LearningGoal) {
    setEditing(goal);
    setTitle(goal.title);
    setTerm(goal.term);
    setDomain(goal.domain);
    setSkill(goal.skill);
    setMeasure(goal.measure);
    setCadence(goal.cadence);
    setTarget(goal.targetCount);
    setStatus(
      "Editing your goal below. No changes are saved until you choose Save.",
    );
  }
  function exportGoals() {
    try {
      const raw =
        window.localStorage.getItem(GOALS_STORAGE_KEY) ?? JSON.stringify(state);
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "lexis-goals-backup.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setError(
        "This browser could not export your goals. No data was changed.",
      );
    }
  }
  const goalViews = useMemo(
    () =>
      state.goals.map((goal) => ({
        goal,
        progress: goalProgress(goal, rows, learning.now),
        suggestion: suggestGoalLoad(goal, rows, learning.now),
      })),
    [state.goals, rows, learning.now],
  );
  const visible = goalViews.filter(
    ({ goal }) => showArchived || !goal.archived,
  );
  return (
    <Shell title="Goals">
      <div className={styles.workspace}>
        <header className={styles.header}>
          <p className="eyebrow">YOUR GOALS</p>
          <h1>
            A direction.
            <br />
            <span>Your own rhythm.</span>
          </h1>
          <p>
            Choose what matters and a workable amount of practice. Time away
            carries no penalty, and a completed count is never presented as
            complete language mastery.
          </p>
          <div className={styles.links}>
            <Link className="text-link" href="/core">
              Back to Core
            </Link>
            <Link className="text-link" href="/core/observatory">
              See the evidence
            </Link>
            <Link className="text-link" href="/learn/practice">
              Start practice
            </Link>
          </div>
        </header>
        {!ready && <p role="status">Opening your local goals…</p>}
        {error && (
          <div className={styles.notice} role="alert">
            <p>{error}</p>
            <button className="button ghost" onClick={load}>
              Reload goals
            </button>
          </div>
        )}
        {status && <p role="status">{status}</p>}
        <section className={`${styles.panel} glass-panel`}>
          <h2>{editing ? "Edit your goal" : "Choose a useful direction"}</h2>
          <form className={styles.form} onSubmit={submit}>
            <label className={`${styles.field} ${styles.full}`}>
              Goal title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={240}
                required
                placeholder="Read with more confidence, prepare for travel…"
              />
            </label>
            <label className={styles.field}>
              Horizon
              <select
                value={term}
                onChange={(event) =>
                  setTerm(event.target.value as LearningGoal["term"])
                }
              >
                <option value="short">Short term</option>
                <option value="long">Long term</option>
              </select>
            </label>
            <label className={styles.field}>
              Your subject or context
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                maxLength={160}
                required
                list="goal-domain-examples"
              />
              <datalist id="goal-domain-examples">
                <option value="General English" />
                <option value="Travel and everyday life" />
                <option value="Academic English" />
                <option value="Professional English" />
                <option value="Technology" />
              </datalist>
            </label>
            <label className={styles.field}>
              Focus skill
              <select
                value={skill}
                onChange={(event) =>
                  setSkill(event.target.value as LearningGoal["skill"])
                }
              >
                <option value="any">Any independently observed skill</option>
                {OBSERVATORY_SKILLS.map((item) => (
                  <option key={item} value={item}>
                    {knowledgeSkillLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Count toward this goal
              <select
                value={measure}
                onChange={(event) =>
                  setMeasure(event.target.value as LearningGoal["measure"])
                }
              >
                <option value="independent-attempts">
                  Independent assessed attempts
                </option>
                <option value="independent-accepted">
                  Independent accepted outcomes
                </option>
              </select>
            </label>
            <label className={styles.field}>
              Target count
              <input
                type="number"
                min={1}
                max={500}
                required
                value={target}
                onChange={(event) => setTarget(Number(event.target.value))}
              />
            </label>
            <label className={styles.field}>
              Practice window
              <select
                value={cadence}
                onChange={(event) =>
                  setCadence(event.target.value as LearningGoal["cadence"])
                }
              >
                <option value="7-days">Rolling 7 days</option>
                <option value="30-days">Rolling 30 days</option>
                <option value="since-start">Since this goal began</option>
              </select>
            </label>
            <p className={`${styles.note} ${styles.full}`}>
              Progress counts matching task observations after this goal
              started. It excludes self-ratings, hints, transcripts, challenged
              or unassessed answers. A subject label states your preference;
              content relevance is not inferred from a word match.
              Listening/speech need connected capabilities.
            </p>
            <div className={`${styles.actions} ${styles.full}`}>
              <button
                className="button primary"
                type="submit"
                disabled={!ready || !readable}
              >
                {editing ? "Save goal changes" : "Save goal"}
              </button>
              {editing && (
                <button
                  className="button ghost"
                  type="button"
                  onClick={clearForm}
                >
                  Cancel editing
                </button>
              )}
            </div>
          </form>
        </section>
        <section className={`${styles.panel} glass-panel`}>
          <h2>Your directions</h2>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Include archived goals
          </label>
          {visible.length ? (
            <ul className={styles.list}>
              {visible.map(({ goal, progress, suggestion }) => {
                return (
                  <li className={styles.row} key={goal.id}>
                    <div className={styles.rowHeading}>
                      <h3>{goal.title}</h3>
                      <span className={styles.badge}>
                        {goal.archived
                          ? "Archived"
                          : goal.term === "short"
                            ? "Short term"
                            : "Long term"}
                      </span>
                    </div>
                    <p className={styles.meta}>
                      {goal.domain} ·{" "}
                      {goal.skill === "any"
                        ? "Any skill"
                        : knowledgeSkillLabels[goal.skill]}
                    </p>
                    <p>
                      <strong>
                        {progress.count} / {progress.target}
                      </strong>{" "}
                      {goal.measure === "independent-attempts"
                        ? "independent assessed attempts"
                        : "independent accepted outcomes"}
                    </p>
                    <progress
                      className={styles.progress}
                      value={Math.min(progress.count, progress.target)}
                      max={progress.target}
                      aria-label={`${goal.title}: ${progress.count} of ${progress.target}`}
                    />
                    <p className={styles.note}>
                      {progress.clockIssue
                        ? "This device's time is earlier than the goal's start. Check the clock; no progress was inferred."
                        : `Window: ${new Date(progress.from).toLocaleDateString()} through now. This measures the selected practice target, not completion of the whole personal goal.`}
                    </p>
                    <details>
                      <summary>Where this progress comes from</summary>
                      <p className={styles.note}>
                        Method: {progress.methodologyVersion}.{" "}
                        {progress.sourceIds.length} distinct active task
                        observations, exact skill filter, independence required.
                        Exclusions update this count immediately. No streak or
                        proficiency percentage is invented.
                      </p>
                      <Link
                        className="text-link"
                        href={`/core/observatory${goal.skill === "any" ? "" : `?skill=${encodeURIComponent(goal.skill)}`}`}
                      >
                        Inspect matching evidence
                      </Link>
                    </details>
                    <div className={styles.actions}>
                      <button
                        className="button ghost"
                        onClick={() => edit(goal)}
                        disabled={!readable}
                      >
                        Edit goal
                      </button>
                      <button
                        className="button ghost"
                        disabled={!readable}
                        onClick={() => {
                          try {
                            if (
                              commit(
                                reviseGoal(
                                  state,
                                  goal.id,
                                  goal.revision,
                                  { archived: !goal.archived },
                                  new Date().toISOString(),
                                ),
                              )
                            )
                              setStatus(
                                goal.archived
                                  ? "Goal restored."
                                  : "Goal archived. Its definition and learning evidence are preserved.",
                              );
                          } catch (cause) {
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : "Goal was not changed.",
                            );
                          }
                        }}
                      >
                        {goal.archived ? "Restore goal" : "Archive goal"}
                      </button>
                      {suggestion && (
                        <button
                          className="button secondary"
                          onClick={() => setProposal(suggestion)}
                        >
                          Review a smaller-load suggestion
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>
              <p>
                {state.goals.length
                  ? "No active goals. Archived goals remain available above."
                  : "No goals yet. You can keep exploring or save one practical direction."}
              </p>
              <p className={styles.note}>
                Goals are optional. Every learning tool remains available.
              </p>
            </div>
          )}
        </section>
        <section className={`${styles.panel} glass-panel`}>
          <h2>Local, editable preferences</h2>
          <p className={styles.note}>
            Goals are declared intentions, separate from observed habits or
            knowledge. They are stored only in this browser. Export before
            changing devices; cloud sync and automatic Tutor planning are not
            connected.
          </p>
          <div className={styles.actions}>
            <button className="button secondary" onClick={exportGoals}>
              Export goals backup
            </button>
            <button className="button ghost" onClick={() => setResetOpen(true)}>
              Remove local goals
            </button>
          </div>
          <label className={styles.field}>
            Preview a goals backup
            <input
              type="file"
              accept="application/json,.json"
              disabled={!ready || !readable}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                const base = snapshot.current;
                const before = state;
                try {
                  if (file.size > 100_000)
                    throw new Error("Goals backups are limited to 100 KB.");
                  const raw = await file.text();
                  if (base !== snapshot.current)
                    throw new Error(
                      "Goals changed while opening the backup. Preview it again.",
                    );
                  setRestore({
                    base,
                    ...previewGoalRestore(before, JSON.parse(raw)),
                  });
                  setError("");
                } catch (cause) {
                  setError(
                    cause instanceof Error &&
                      /backup|Goals|goal|copies|version/.test(cause.message)
                      ? cause.message
                      : "The goals backup is unreadable. Your existing goals were not changed.",
                  );
                }
              }}
            />
          </label>
        </section>
        <Modal
          open={restore !== null}
          title="Restore these goals?"
          onClose={() => setRestore(null)}
        >
          {restore && (
            <>
              <p>
                This backup contains {restore.incoming} goals. It adds{" "}
                {restore.added} new goals and keeps identical existing goals. It
                does not change learning observations.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setRestore(null)}
                >
                  Keep current data
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    if (restore.base !== snapshot.current) {
                      setError(
                        "Goals changed after this restore preview. Preview the backup again.",
                      );
                      return;
                    }
                    if (commit(restore.state)) {
                      setRestore(null);
                      setStatus(
                        "Goals restored. Existing practice observations were not changed.",
                      );
                    }
                  }}
                >
                  Confirm goals restore
                </button>
              </div>
            </>
          )}
        </Modal>
        <Modal
          open={proposal !== null}
          title="Change your practice target?"
          onClose={() => setProposal(null)}
        >
          {proposal && (
            <>
              <p>{proposal.reason}</p>
              <p>
                Proposed target: {proposal.proposedTarget}. Your current goal
                changes only if you confirm.
              </p>
              <p className={styles.note}>
                Source: {proposal.evidenceIds.length} matching independent
                observations · {proposal.policyVersion}. This is a local
                planning suggestion, not an AI diagnosis.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setProposal(null)}
                >
                  Keep my current plan
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    try {
                      const next = reviseGoal(
                        state,
                        proposal.goalId,
                        proposal.expectedRevision,
                        { targetCount: proposal.proposedTarget },
                        new Date().toISOString(),
                      );
                      if (commit(next)) {
                        setProposal(null);
                        setStatus("Your confirmed practice target is saved.");
                      }
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "The plan was not changed.",
                      );
                    }
                  }}
                >
                  Confirm new target
                </button>
              </div>
            </>
          )}
        </Modal>
        <Modal
          open={resetOpen}
          title="Remove local goals?"
          onClose={() => setResetOpen(false)}
        >
          <p>
            This removes goal titles, subjects, targets and archived goals from
            this browser. Your practice observations, saved meanings and other
            materials stay intact. Export a goals backup first.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setResetOpen(false)}
            >
              Keep my goals
            </button>
            <button
              className="button danger"
              onClick={() => {
                try {
                  window.localStorage.removeItem(GOALS_STORAGE_KEY);
                  snapshot.current = null;
                  setState(emptyGoalState());
                  setReadable(true);
                  setError("");
                  setResetOpen(false);
                  setStatus(
                    "Local goals removed. Learning evidence was preserved.",
                  );
                } catch {
                  setError(
                    "Goals could not be removed because browser storage is unavailable.",
                  );
                }
              }}
            >
              Remove goal data
            </button>
          </div>
        </Modal>
      </div>
    </Shell>
  );
}
