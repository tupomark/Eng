"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Shell } from "./shell";
import { Modal } from "./modal";
import { useLearning } from "./learning-provider";
import { useTaskLearning } from "./task-learning-provider";
import {
  buildObservationTrail,
  confirmedMistakePatterns,
  filterObservationTrail,
  OBSERVATORY_SKILLS,
  rollingObservationWindow,
  summarizeObservatory,
  type ObservationTrailRow,
} from "@/domain/knowledge/observatory";
import { targetKey } from "@/domain/tasks/engine";
import type { LearningTarget, TaskSkill } from "@/domain/tasks/types";
import { useLexicalCatalog } from "./lexical-catalog-provider";
import styles from "./knowledge-workspaces.module.css";
import { knowledgeSkillLabels } from "./knowledge-labels";
function formatTargetLabel(
  target: LearningTarget,
  senseLabels: ReadonlyMap<string, string>,
) {
  return target.kind === "sense"
    ? (senseLabels.get(target.senseId) ??
        "Saved meaning · dictionary entry unavailable")
    : target.conceptId.replace(/-/gu, " ");
}
function practiceHref(target: LearningTarget) {
  return target.kind === "sense"
    ? `/learn/practice?sense=${encodeURIComponent(target.senseId)}`
    : `/grammar?concept=${encodeURIComponent(target.conceptId)}`;
}

export function KnowledgeObservatory({
  initialSkill = "",
}: {
  initialSkill?: string;
}) {
  const learning = useLearning();
  const tasks = useTaskLearning();
  const catalog = useLexicalCatalog();
  const senseLabels = useMemo(
    () =>
      new Map(
        catalog.entries.flatMap((entry) =>
          entry.senses.map(
            (sense) =>
              [
                sense.id,
                `${entry.lexeme.lemma} — ${sense.translation || sense.definition}`,
              ] as const,
          ),
        ),
      ),
    [catalog.entries],
  );
  const targetLabel = (target: LearningTarget) =>
    formatTargetLabel(target, senseLabels);
  const [skill, setSkill] = useState(
    OBSERVATORY_SKILLS.includes(initialSkill as TaskSkill)
      ? initialSkill
      : "all",
  );
  const [windowDays, setWindowDays] = useState("30");
  const [query, setQuery] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);
  const [visible, setVisible] = useState(20);
  const [challenge, setChallenge] = useState<ObservationTrailRow | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const trail = useMemo(
    () => buildObservationTrail(learning.state, tasks.state),
    [learning.state, tasks.state],
  );
  const filter = useMemo(
    () => ({
      ...rollingObservationWindow(
        learning.now,
        windowDays === "all" ? null : Number(windowDays),
      ),
      ...(skill === "all" ? {} : { skill: skill as TaskSkill }),
    }),
    [learning.now, windowDays, skill],
  );
  const summary = useMemo(
    () => summarizeObservatory(trail, filter),
    [trail, filter],
  );
  const patterns = useMemo(
    () => confirmedMistakePatterns(trail, filter),
    [trail, filter],
  );
  const savedBySense = useMemo(
    () => new Map(learning.state.saved.map((saved) => [saved.senseId, saved])),
    [learning.state.saved],
  );
  const needle = query.trim().toLocaleLowerCase();
  const filteredRows = useMemo(
    () =>
      filterObservationTrail(trail, {
        ...filter,
        includeExcluded: showExcluded,
      }),
    [trail, filter, showExcluded],
  );
  const rows = filteredRows.filter(
    (row) =>
      !needle ||
      `${targetLabel(row.target)} ${row.result} ${row.explanation} ${row.target.kind === "sense" ? (savedBySense.get(row.target.senseId)?.context ?? "") : ""}`
        .toLocaleLowerCase()
        .includes(needle),
  );
  const attemptsById = useMemo(
    () =>
      new Map(
        tasks.state.attempts.map((attempt) => [
          `observation:${attempt.id}`,
          attempt,
        ]),
      ),
    [tasks.state.attempts],
  );
  const definitions = useMemo(
    () =>
      new Map(
        tasks.state.tasks.map((task) => [`${task.id}\0${task.version}`, task]),
      ),
    [tasks.state.tasks],
  );
  const knownLexemes = useMemo(
    () =>
      new Set(
        learning.state.saved.flatMap((saved) =>
          catalog.entries
            .filter((entry) =>
              entry.senses.some((sense) => sense.id === saved.senseId),
            )
            .map((entry) => entry.lexeme.id),
        ),
      ),
    [learning.state.saved, catalog.entries],
  );
  const unavailableCount = useMemo(
    () =>
      learning.state.saved.filter((saved) => !senseLabels.has(saved.senseId))
        .length,
    [learning.state.saved, senseLabels],
  );
  return (
    <Shell title="Knowledge Observatory">
      <div className={styles.workspace}>
        <header className={styles.header}>
          <p className="eyebrow">KNOWLEDGE OBSERVATORY</p>
          <h1>
            Look closer.
            <br />
            <span>Keep the evidence.</span>
          </h1>
          <p>
            Different meanings, different skills, and room for uncertainty.
            Activity and independently assessed practice stay separate.
          </p>
          <div className={styles.links}>
            <Link className="text-link" href="/core">
              Back to Core
            </Link>
            <Link className="text-link" href="/core/network">
              Explore connections
            </Link>
            <Link className="text-link" href="/goals">
              Your goals
            </Link>
          </div>
        </header>
        {(!learning.ready || !tasks.ready || !catalog.ready) && (
          <p role="status">Opening your local learning history…</p>
        )}
        {catalog.error && (
          <p role="alert" className={styles.notice}>
            {catalog.error}
          </p>
        )}
        {tasks.error && (
          <div className={styles.notice} role="alert">
            {tasks.error}
            <button className="button ghost" onClick={tasks.reload}>
              Reload practice data
            </button>
          </div>
        )}
        <section
          className={`${styles.panel} glass-panel`}
          aria-label="Observation filters"
        >
          <div className={styles.filters}>
            <label className={styles.field}>
              Skill
              <select
                aria-label="Skill"
                value={skill}
                onChange={(event) => {
                  setSkill(event.target.value);
                  setVisible(20);
                }}
              >
                <option value="all">All skills</option>
                {OBSERVATORY_SKILLS.map((item) => (
                  <option key={item} value={item}>
                    {knowledgeSkillLabels[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Time window
              <select
                aria-label="Time window"
                value={windowDays}
                onChange={(event) => {
                  setWindowDays(event.target.value);
                  setVisible(20);
                }}
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All recorded time</option>
              </select>
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              Search your evidence
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisible(20);
                }}
                placeholder="Meaning, concept or saved context"
              />
            </label>
          </div>
          <p className={styles.note}>
            Windows are rolling elapsed days ending now, including the exact
            boundary. Search stays on this device.
          </p>
        </section>
        <section className={`${styles.panel} glass-panel`}>
          <h2>What was actually observed</h2>
          <dl className={styles.counts}>
            <div>
              <dt>Independent task observations</dt>
              <dd>{summary.independent}</dd>
            </div>
            <div>
              <dt>Practice with help</dt>
              <dd>{summary.assisted}</dd>
            </div>
            <div>
              <dt>Your recognition self-ratings</dt>
              <dd>{summary.selfReports}</dd>
            </div>
          </dl>
          <p className={styles.note}>
            {summary.independentAccepted} independent accepted outcomes in this
            window. {summary.excluded} excluded observations. Counts describe
            this sample; they are not a mastery percentage or a CEFR
            certificate.
          </p>
          <details>
            <summary>How these counts are calculated</summary>
            <p className={styles.note}>
              Method: {summary.methodologyVersion}. Each active observation ID
              is counted once for its exact target and skill. Help includes
              hints or a visible transcript. Revealed answers, accepted
              corrections and uncertain/provider-failed attempts create no
              independent observation. Challenged observations are excluded.
              FSRS ratings and imported scheduler history are not counted again
              as task evidence.
            </p>
            <p className={styles.note}>
              Library activity, across all recorded time:{" "}
              {learning.state.saved.length} saved meanings; {knownLexemes.size}{" "}
              identifiable editorial lexemes; {unavailableCount} saved meanings
              outside the current sample dictionary. Saved does not mean
              learned.
            </p>
          </details>
        </section>
        <section className={`${styles.panel} glass-panel`}>
          <h2>Skills, independently</h2>
          <ul className={styles.list}>
            {summary.skills.map((item) => (
              <li className={styles.row} key={item.skill}>
                <div className={styles.rowHeading}>
                  <h3>{knowledgeSkillLabels[item.skill]}</h3>
                  <span className={styles.badge}>
                    {item.status === "insufficient-data"
                      ? "Not independently measured in this window"
                      : `${item.independent} independent observations`}
                  </span>
                </div>
                <p className={styles.meta}>
                  {item.assisted} assisted · {item.selfReports} self-reports
                  {item.lastIndependentAt
                    ? ` · latest ${new Date(item.lastIndependentAt).toLocaleDateString()}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            Missing observations mean insufficient data. They do not prove a
            weakness or zero knowledge.
          </p>
        </section>
        <section className={`${styles.panel} glass-panel`}>
          <h2>Patterns worth revisiting</h2>
          <p className={styles.note}>
            Mistake DNA here means repeated, independently observed task
            difficulty. It is editable evidence, never a fixed type of learner.
          </p>
          {patterns.length ? (
            <ul className={styles.list}>
              {patterns.map((pattern) => (
                <li
                  className={styles.row}
                  key={`${targetKey(pattern.target)}:${pattern.skill}`}
                >
                  <h3>{targetLabel(pattern.target)}</h3>
                  <p>
                    {pattern.count} independent “not yet” outcomes ·{" "}
                    {knowledgeSkillLabels[pattern.skill]}
                  </p>
                  <Link
                    className="text-link"
                    href={practiceHref(pattern.target)}
                  >
                    Revisit this objective
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <p>No repeated independent difficulty in this window.</p>
              <p className={styles.note}>
                Self-ratings, assisted attempts and excluded observations do not
                create a confirmed pattern.
              </p>
            </div>
          )}
        </section>
        <section className={`${styles.panel} glass-panel`}>
          <h2>Your evidence trail</h2>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={showExcluded}
              onChange={(event) => setShowExcluded(event.target.checked)}
            />
            Include excluded observations in the audit
          </label>
          {rows.length ? (
            <ul className={styles.list}>
              {rows.slice(0, visible).map((row) => {
                const attempt = attemptsById.get(row.id);
                const definition = row.taskId
                  ? definitions.get(`${row.taskId}\0${row.taskVersion}`)
                  : null;
                const saved =
                  row.target.kind === "sense"
                    ? savedBySense.get(row.target.senseId)
                    : null;
                return (
                  <li className={styles.row} key={row.id}>
                    <div className={styles.rowHeading}>
                      <h3>{targetLabel(row.target)}</h3>
                      <span className={styles.badge}>
                        {row.excluded
                          ? "Excluded from calculations"
                          : row.origin === "self-report"
                            ? "Self-report"
                            : row.independent
                              ? "Independent task"
                              : "Assisted task"}
                      </span>
                    </div>
                    <p>
                      {knowledgeSkillLabels[row.skill]} · {row.result}
                    </p>
                    <p className={styles.meta}>
                      {new Date(row.occurredAt).toLocaleString()} ·{" "}
                      {row.provider}
                    </p>
                    <details>
                      <summary>Open the source and explanation</summary>
                      {definition && <p>{definition.prompt}</p>}
                      {attempt && (
                        <blockquote className={styles.quote}>
                          {attempt.answer}
                        </blockquote>
                      )}
                      {saved?.context && (
                        <blockquote className={styles.quote}>
                          {saved.context}
                        </blockquote>
                      )}
                      <p>{row.explanation}</p>
                      <p className={styles.meta}>
                        Rubric: {row.rubricVersion}. Reference: {row.sourceId}
                      </p>
                      {attempt && (
                        <p className={styles.meta}>
                          Hints: {attempt.assistance.hintIds.length};
                          transcript:{" "}
                          {attempt.assistance.transcriptRevealedAt
                            ? "visible"
                            : "hidden or not applicable"}
                          .
                        </p>
                      )}
                    </details>
                    {!row.excluded && (
                      <button
                        className="button ghost"
                        onClick={() => {
                          setChallenge(row);
                          setReason("");
                        }}
                      >
                        Challenge this observation
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>
              <p>No observations match these filters.</p>
              <Link className="text-link" href="/learn/practice">
                Try a measured task
              </Link>
            </div>
          )}
          {rows.length > visible && (
            <button
              className="button secondary"
              onClick={() => setVisible((count) => count + 20)}
            >
              Show 20 more observations
            </button>
          )}
          {status && <p role="status">{status}</p>}
        </section>
        <Modal
          open={challenge !== null}
          title="Challenge this observation"
          onClose={() => setChallenge(null)}
        >
          <p>
            The original stays in your audit. The observation is excluded from
            active calculations while you question it; linked schedules are
            replayed.
          </p>
          <label className={styles.field}>
            What should be reconsidered?
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setChallenge(null)}
            >
              Keep the observation
            </button>
            <button
              className="button primary"
              disabled={!reason.trim()}
              onClick={() => {
                if (!challenge) return;
                const ok =
                  challenge.origin === "self-report"
                    ? learning.dispute(challenge.sourceId)
                    : tasks.challenge(challenge.sourceId, reason);
                if (ok) {
                  setChallenge(null);
                  setStatus(
                    "Observation excluded. The original remains in your audit.",
                  );
                }
              }}
            >
              Exclude from calculations
            </button>
          </div>
        </Modal>
      </div>
    </Shell>
  );
}
