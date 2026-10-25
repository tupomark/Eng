"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createReviewIdentity,
  fsrsItemDue,
  FSRS_SCHEDULER_VERSION,
  type ReviewIdentity,
} from "@/domain/scheduling";
import type { TaskAttempt, TaskDefinition } from "@/domain/tasks";
import type {
  LegacyMigrationPreview,
  TaskRestorePreview,
} from "@/application/task-session";
import { type EditorialFormat } from "@/infrastructure/dictionary/editorial-tasks";
import {
  catalogTask,
  catalogRecognitionChoices,
} from "@/infrastructure/dictionary/catalog-tasks";
import type { LookupDictionaryEntry } from "@/application/dictionary-lookup";
import { GRAMMAR_CONCEPTS } from "@/domain/writing/grammar";
import {
  parsePracticeSession,
  practiceSessionPolicy,
  type PracticeSession,
} from "@/domain/tasks/practice-session";
import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";
import { useLearning } from "./learning-provider";
import { useTaskLearning } from "./task-learning-provider";
import { Shell } from "./shell";
import { knowledgeSkillLabels } from "./knowledge-labels";
import { usePreferences } from "./preferences-provider";
import { useLexicalCatalog } from "./lexical-catalog-provider";
import styles from "./practice.module.css";

const ratingLabels = ["again", "hard", "good", "easy"] as const;
const SESSION_KEY = "lexis.practice-session.v1";
const SESSION_UPDATED = "lexis-practice-session-updated";
function sessionSnapshot(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return "storage-unavailable";
  }
}
function subscribeSession(listener: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", sync);
  window.addEventListener(SESSION_UPDATED, listener);
  return () => {
    window.removeEventListener("storage", sync);
    window.removeEventListener(SESSION_UPDATED, listener);
  };
}
const serverSessionSnapshot = () => undefined;
const promptLabels: Record<string, string> = {
  "self-recognition": "Recognition self-check",
  "meaning-choice": "Choose a meaning",
  "word-recall": "Recall the English word",
  "independent-sentence": "Write your own sentence",
  "editorial-concept-choice": "Grammar choice",
  "editorial-listening-location": "Understand a spoken location",
};
function reviewTargetLabel(
  target: ReviewIdentity["target"],
  entries: readonly LookupDictionaryEntry[],
): string {
  if (target.kind === "grammar")
    return (
      GRAMMAR_CONCEPTS.find((concept) => concept.id === target.conceptId)
        ?.title ?? "Unavailable grammar concept"
    );
  const entry = entries.find((item) =>
    item.senses.some((sense) => sense.id === target.senseId),
  );
  const sense = entry?.senses.find((item) => item.id === target.senseId);
  return entry && sense
    ? `${entry.lexeme.lemma} — ${sense.translation || sense.definition}`
    : "Unavailable saved meaning";
}
export function Practice() {
  const query = useSearchParams();
  const router = useRouter();
  const learning = useLearning();
  const tasks = useTaskLearning();
  const catalog = useLexicalCatalog();
  const meanings = useMemo(
    () =>
      catalog.entries.flatMap((entry) =>
        entry.senses.map((sense) => ({ entry, sense })),
      ),
    [catalog.entries],
  );
  const { preferences, change, ready: preferencesReady } = usePreferences();
  const [senseId, setSenseId] = useState(query.get("sense") ?? "linger-stay");
  const [format, setFormat] = useState<EditorialFormat>(() =>
    ["recognition", "recall", "translation-to-en", "own-sentence"].includes(
      query.get("format") ?? "",
    )
      ? (query.get("format") as EditorialFormat)
      : "recognition",
  );
  const [notice, setNotice] = useState("");
  const [scheduleLimit, setScheduleLimit] = useState(20);
  const [legacy, setLegacy] = useState<LegacyMigrationPreview | null>(null);
  const [restore, setRestore] = useState<TaskRestorePreview | null>(null);
  const [sessionWriteError, setSessionError] = useState("");
  const sessionBytes = useSyncExternalStore(
    subscribeSession,
    sessionSnapshot,
    serverSessionSnapshot,
  );
  const sessionReady = sessionBytes !== undefined;
  const restoredSession = useMemo(() => {
    try {
      const bytes = sessionBytes;
      if (bytes && bytes.length > 120_000)
        throw new Error("Your practice session is too large to open safely.");
      return {
        session: bytes == null ? null : parsePracticeSession(JSON.parse(bytes)),
        error: "",
      };
    } catch {
      return {
        session: null,
        error:
          "Your saved practice session could not be opened and has been preserved. Other learning data is unchanged. Export your local profile before recovery.",
      };
    }
  }, [sessionBytes]);
  const session = restoredSession.session;
  const sessionError = restoredSession.error || sessionWriteError;
  function writeSession(next: PracticeSession): boolean {
    try {
      assertLocalWritesAllowed(localStorage);
      if (localStorage.getItem(SESSION_KEY) !== sessionBytes)
        throw new Error(
          "This session changed in another tab. Reload before continuing.",
        );
      const serialized = JSON.stringify(parsePracticeSession(next));
      localStorage.setItem(SESSION_KEY, serialized);
      window.dispatchEvent(new Event(SESSION_UPDATED));
      setSessionError("");
      return true;
    } catch (cause) {
      setSessionError(
        cause instanceof Error
          ? cause.message
          : "The session could not be saved. Your answer and learning history remain intact.",
      );
      return false;
    }
  }
  const policy = practiceSessionPolicy({
    mode: preferences.learningMode,
    dailyItems: preferences.dailyItems,
    now: learning.now,
    session,
    attempts: tasks.state.attempts,
    ratings: tasks.state.scheduleEvents,
  });
  function selectPractice(nextSense: string, nextFormat: EditorialFormat) {
    setSenseId(nextSense);
    setFormat(nextFormat);
    router.replace(
      `/learn/practice?sense=${encodeURIComponent(nextSense)}&format=${nextFormat}`,
      { scroll: false },
    );
  }
  const selectedMeaning = catalog.findSense(senseId);
  const task = selectedMeaning
    ? catalogTask(selectedMeaning.entry, senseId, format)
    : null;
  const attempt = task
    ? tasks.state.attempts
        .filter(
          (item) =>
            item.taskId === task.id && item.taskVersion === task.version,
        )
        .at(-1)
    : undefined;
  function download(text: string | null, name: string) {
    if (text === null) return;
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return (
    <Shell title="Learn">
      <div className={styles.workspace}>
        <div className="page-heading">
          <p className="eyebrow">SMART CARDS · FSRS</p>
          <h1>A different way to practise.</h1>
          <p className="intro-copy">
            Choose a meaning and one skill. Your answer, any help and your
            scheduling rating are recorded separately.
          </p>
        </div>
        <nav aria-label="Learning workspaces" className={styles.actions}>
          <Link className="text-link" href="/learn">
            Self-check reviews
          </Link>
          <Link className="text-link" href="/grammar">
            Grammar Atlas
          </Link>
          <Link className="text-link" href="/writing">
            Writing Studio
          </Link>
        </nav>
        {(tasks.error || learning.error || catalog.error) && (
          <p role="alert" className={styles.error}>
            {tasks.error || learning.error || catalog.error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <section className={styles.card} aria-label="Practice session">
          <h2>Your pace</h2>
          <label className={styles.answer}>
            Session mode
            <select
              aria-label="Session mode"
              value={preferences.learningMode}
              disabled={!preferencesReady}
              onChange={(event) =>
                change({
                  learningMode: event.target
                    .value as typeof preferences.learningMode,
                })
              }
            >
              <option value="quick">Quick · up to five tasks</option>
              <option value="focused">Focused · a bounded session</option>
              <option value="free">Free Exploration · choose manually</option>
              <option value="goal">Goal Training · queue not configured</option>
            </select>
          </label>
          {preferences.learningMode === "goal" ? (
            <p>
              Select and review a goal in <Link href="/goals">Goals</Link>.
              Goal-driven task selection is not configured yet; choose another
              mode to practise manually.
            </p>
          ) : preferences.learningMode === "free" ? (
            <p>
              Choose any available meaning and format. No next-task queue or
              automatic stopping point. Your daily pace remains a suggestion.
            </p>
          ) : (
            <p>
              {preferences.learningMode === "quick"
                ? "A short visit"
                : "A structured session"}
              : {policy.sessionCompleted} completed in this session · up to{" "}
              {policy.limit} tasks. {policy.remaining} remaining within your
              daily pace of {preferences.dailyItems}. Hints stay optional; every
              use is recorded.
            </p>
          )}
          <p className={styles.status}>
            Changing mode keeps completed answers. Workload limits never change
            evidence or your FSRS schedule.
          </p>
          {sessionError && <p role="alert">{sessionError}</p>}
          {session && (
            <button
              className="button secondary small"
              disabled={!sessionReady || Boolean(sessionError)}
              onClick={() => selectPractice(session.senseId, session.format)}
            >
              Resume saved session position
            </button>
          )}
          {policy.remaining === 0 && (
            <p role="status">
              A good place to pause. You can finish here, or choose Free
              Exploration for manual practice.
            </p>
          )}
          {session &&
            policy.remaining === 0 &&
            policy.dailyUsed < preferences.dailyItems && (
              <button
                className="button secondary small"
                disabled={Boolean(sessionError)}
                onClick={() =>
                  writeSession({
                    version: 1,
                    revision: session.revision + 1,
                    startedAt: learning.now,
                    senseId,
                    format,
                    attemptIds: [],
                  })
                }
              >
                Start a new short session
              </button>
            )}
          {policy.offersNext && session && policy.canStart && (
            <button
              className="button secondary small"
              onClick={() => {
                const practiced = new Set(
                  tasks.state.attempts
                    .filter((item) => session.attemptIds.includes(item.id))
                    .map((item) => item.taskId),
                );
                const candidate = meanings.find((item) => {
                  const nextTask = catalogTask(
                    item.entry,
                    item.sense.id,
                    format,
                  );
                  return Boolean(
                    nextTask &&
                    learning.state.saved.some(
                      (saved) => saved.senseId === item.sense.id,
                    ) &&
                    !practiced.has(nextTask.id),
                  );
                });
                if (candidate) selectPractice(candidate.sense.id, format);
                else
                  setNotice(
                    "No unvisited saved meaning is available for this format. Choose a meaning manually, change format or finish here.",
                  );
              }}
            >
              Choose next saved meaning
            </button>
          )}
        </section>
        <div className={styles.controls}>
          <label>
            Meaning
            <select
              aria-label="Practice meaning"
              value={senseId}
              disabled={!catalog.ready}
              onChange={(event) => {
                setSenseId(event.target.value);
                router.replace(
                  `/learn/practice?sense=${encodeURIComponent(event.target.value)}&format=${format}`,
                  { scroll: false },
                );
                setNotice("");
              }}
            >
              {!selectedMeaning && (
                <option value={senseId}>Unavailable saved meaning</option>
              )}
              {meanings.map(({ entry, sense }) => (
                <option key={sense.id} value={sense.id}>
                  {entry.lexeme.lemma} — {sense.translation || sense.definition}
                </option>
              ))}
            </select>
          </label>
          <label>
            Task format
            <select
              aria-label="Task format"
              value={format}
              onChange={(event) => {
                setFormat(event.target.value as EditorialFormat);
                router.replace(
                  `/learn/practice?sense=${encodeURIComponent(senseId)}&format=${event.target.value}`,
                  { scroll: false },
                );
                setNotice("");
              }}
            >
              <option value="recognition">
                Recognition · choose a meaning
              </option>
              <option value="recall">Recall · English base form</option>
              <option value="translation-to-en">
                Recall · Russian to English
              </option>
              <option value="own-sentence">
                Writing · evaluator not connected
              </option>
            </select>
          </label>
        </div>
        {!task ? (
          <p role="status">
            This meaning is not available in the current practice collection.
            Your existing history is preserved.{" "}
            <Link href="/library">Return to Library</Link>
          </p>
        ) : (
          <>
            <p className={styles.status}>
              {task.source.kind === "user"
                ? "Your own note · checks your answer key, not independently verified dictionary accuracy."
                : "Original editorial practice · eight-word collection."}{" "}
              Open writing answers are saved without a grade until an evaluator
              is configured.
            </p>
            <button
              className="button primary"
              disabled={
                !tasks.ready ||
                !catalog.ready ||
                !learning.ready ||
                !sessionReady ||
                Boolean(sessionError) ||
                (!policy.canStart && attempt?.status !== "answering") ||
                Boolean(tasks.error || learning.error)
              }
              onClick={() => {
                if (
                  !learning.state.saved.some(
                    (saved) => saved.senseId === senseId,
                  ) &&
                  !learning.save(senseId, task.context?.excerpt ?? "")
                )
                  return;
                const started = tasks.startTask(task);
                if (started)
                  writeSession({
                    version: 1,
                    revision: (session?.revision ?? -1) + 1,
                    startedAt: session?.startedAt ?? learning.now,
                    senseId,
                    format,
                    attemptIds: [
                      ...new Set([...(session?.attemptIds ?? []), started.id]),
                    ],
                  });
                setNotice("");
              }}
            >
              {attempt && attempt.status !== "evaluated"
                ? "Continue this task"
                : attempt
                  ? "Start another attempt"
                  : learning.state.saved.some(
                        (saved) => saved.senseId === senseId,
                      )
                    ? "Start this task"
                    : "Save meaning and start"}
            </button>
            {attempt && (
              <TaskCard key={attempt.id} task={task} attempt={attempt} />
            )}
          </>
        )}
        <section className={styles.card} aria-label="FSRS schedule">
          <h2>Why and when it returns</h2>
          <p>
            Each meaning or grammar concept has a separate history for the skill
            you practise. A scheduling rating is your choice; it is not an
            objective language score. Related formats share a recall history
            only when they measure that same objective.
          </p>
          <p className={styles.status}>
            {tasks.dueSchedules.length} objectives available in the current
            queue (up to 20, one sibling per target).
          </p>
          {tasks.schedules.length === 0 ? (
            <p>
              No practice schedule yet. Start a task above or preview your
              existing recognition history below.
            </p>
          ) : (
            tasks.schedules.slice(0, scheduleLimit).map((schedule) => (
              <div className={styles.row} key={schedule.item.id}>
                <strong>
                  {reviewTargetLabel(schedule.item.target, catalog.entries)}
                </strong>
                <p>
                  {knowledgeSkillLabels[schedule.item.skill]} ·{" "}
                  {promptLabels[schedule.item.promptFamily] ??
                    "Practice objective"}{" "}
                  ·{" "}
                  {tasks.state.archivedItemIds.includes(schedule.item.id)
                    ? "Archived"
                    : `Due ${new Date(schedule.card.due).toLocaleString()}`}
                </p>
                <div className={styles.actions}>
                  <button
                    className="button secondary small"
                    onClick={() =>
                      tasks.archive(
                        schedule.item.id,
                        !tasks.state.archivedItemIds.includes(schedule.item.id),
                      )
                    }
                  >
                    {tasks.state.archivedItemIds.includes(schedule.item.id)
                      ? "Return to practice"
                      : "Archive objective"}
                  </button>
                  <button
                    className="button ghost small"
                    onClick={() =>
                      tasks.postpone(
                        schedule.item.id,
                        new Date(Date.now() + 86_400_000).toISOString(),
                      )
                    }
                  >
                    Postpone for a day
                  </button>
                </div>
                <p className={styles.status}>
                  Archiving and postponing change workload, never competence or
                  previous evidence.
                </p>
                {schedule.item.promptFamily === "self-recognition" &&
                  !tasks.state.archivedItemIds.includes(schedule.item.id) && (
                    <LegacySelfCheck
                      key={`${schedule.item.id}:${schedule.card.due}`}
                      itemId={schedule.item.id}
                      onRated={() =>
                        setNotice(
                          "Recognition schedule updated. Your original self-report history stays intact.",
                        )
                      }
                    />
                  )}
              </div>
            ))
          )}
          {tasks.schedules.length > scheduleLimit && (
            <button
              className="button secondary"
              onClick={() => setScheduleLimit((limit) => limit + 20)}
            >
              Show 20 more objectives
            </button>
          )}
          <details>
            <summary>Scheduling details</summary>
            <p className={styles.status}>
              Scheduler version: {FSRS_SCHEDULER_VERSION}. Different question
              formats share a schedule only when they explicitly practise the
              same target and skill.
            </p>
          </details>
        </section>
        <details className={styles.tools}>
          <summary>Move recognition history to FSRS</summary>
          <p>
            Your existing heuristic-v1 data stays intact. An explicit bootstrap
            copies only recognition self-ratings, including exclusions, into a
            separate FSRS schedule. It does not add objective evidence or any
            other skill.
          </p>
          <button
            className="button secondary"
            disabled={!tasks.ready || !learning.ready}
            onClick={() => setLegacy(tasks.previewLegacy(learning.state))}
          >
            Preview recognition migration
          </button>
          {legacy && (
            <div>
              <p>
                {legacy.preview.sourceCounts.saved} meanings ·{" "}
                {legacy.preview.sourceCounts.evidence} historical ratings ·{" "}
                {legacy.preview.sourceCounts.disputed} excluded.
              </p>
              <div className={styles.actions}>
                <button
                  className="button secondary"
                  onClick={() =>
                    download(
                      JSON.stringify(legacy.source),
                      "lexis-legacy-before-fsrs.json",
                    )
                  }
                >
                  Download original history
                </button>
                <button
                  className="button primary"
                  onClick={() => {
                    if (tasks.importLegacy(legacy)) {
                      setLegacy(null);
                      setNotice(
                        "Recognition history copied to FSRS. The original learning v1 data remains unchanged.",
                      );
                    }
                  }}
                >
                  Confirm FSRS bootstrap
                </button>
              </div>
            </div>
          )}
        </details>
        <details id="data" className={styles.tools}>
          <summary>Practice backup and restore</summary>
          <p>
            Includes tasks, attempts, help, challenges and FSRS events. Separate
            from the original learning v1 and private book/draft exports.
          </p>
          <button
            className="button secondary"
            onClick={() =>
              download(tasks.exportData(), "lexis-practice-backup.json")
            }
          >
            Export practice data
          </button>
          <label className={styles.answer}>
            Restore practice JSON (up to 10 MB)
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                setRestore(null);
                if (!file) return;
                if (file.size > 10_000_000) {
                  setNotice(
                    "This practice backup exceeds 10 MB. Nothing was changed.",
                  );
                  return;
                }
                try {
                  setRestore(tasks.previewRestore(await file.text()));
                } catch {
                  setNotice(
                    "This file could not be read. Your current practice data remains intact.",
                  );
                }
              }}
            />
          </label>
          {restore && (
            <div>
              <p>
                After merge: {restore.counts.tasks} task revisions ·{" "}
                {restore.counts.attempts} attempts · {restore.counts.reviews}{" "}
                scheduling events · {restore.counts.challenges} challenges.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  if (tasks.confirmRestore(restore)) {
                    setRestore(null);
                    setNotice(
                      "Practice backup merged without replacing existing identities.",
                    );
                  }
                }}
              >
                Confirm practice restore
              </button>
            </div>
          )}
        </details>
      </div>
    </Shell>
  );
}

function LegacySelfCheck({
  itemId,
  onRated,
}: {
  itemId: string;
  onRated(): void;
}) {
  const tasks = useTaskLearning();
  const { state, now } = useLearning();
  const catalog = useLexicalCatalog();
  const [revealed, setRevealed] = useState(false);
  const [rated, setRated] = useState(false);
  const ratingInFlight = useRef(false);
  const eventId = useRef<string | null>(null);
  const schedule = tasks.schedules.find((item) => item.item.id === itemId);
  const target = schedule?.item.target;
  const meaning =
    target?.kind === "sense" ? catalog.findSense(target.senseId) : undefined;
  if (!schedule || !meaning)
    return (
      <p className={styles.status}>
        The original meaning is unavailable. This schedule and its history are
        preserved; other objectives remain available.
      </p>
    );
  const context = state.saved.find(
    (saved) => saved.senseId === meaning.sense.id,
  )?.context;
  if (!fsrsItemDue(schedule, now))
    return (
      <p className={styles.status} role="status">
        {rated ? "Recognition schedule updated. " : ""}Next recognition
        self-check:{" "}
        <time dateTime={schedule.card.due}>
          {new Date(schedule.card.due).toLocaleString()}
        </time>
        .
      </p>
    );
  return (
    <section aria-label={`FSRS self-check for ${meaning.entry.lexeme.lemma}`}>
      <p>Recognition self-check: {meaning.entry.lexeme.lemma}</p>
      <blockquote>{context?.trim() || meaning.sense.example}</blockquote>
      {!revealed ? (
        <button
          className="button secondary"
          disabled={tasks.decisionsBlocked || Boolean(tasks.error)}
          onClick={() => {
            eventId.current = crypto.randomUUID();
            setRevealed(true);
          }}
        >
          Reveal saved meaning
        </button>
      ) : (
        <div>
          <p>{meaning.sense.definition}</p>
          <p lang="ru">{meaning.sense.translation}</p>
          <p className={styles.status}>
            Your self-report updates this recognition schedule. It does not
            create an objective competence observation.
          </p>
          <div className={styles.actions}>
            {ratingLabels.map((rating) => (
              <button
                key={rating}
                className="button secondary small"
                disabled={
                  rated || tasks.decisionsBlocked || Boolean(tasks.error)
                }
                onClick={() => {
                  if (ratingInFlight.current || !eventId.current) return;
                  ratingInFlight.current = true;
                  if (
                    tasks.recordRating(
                      itemId,
                      rating,
                      undefined,
                      eventId.current,
                    )
                  ) {
                    setRated(true);
                    onRated();
                  } else ratingInFlight.current = false;
                }}
              >
                {rating[0].toUpperCase() + rating.slice(1)}
              </button>
            ))}
          </div>
          {rated && <p role="status">Recognition schedule updated.</p>}
        </div>
      )}
    </section>
  );
}

function TaskCard({
  task,
  attempt,
}: {
  task: TaskDefinition;
  attempt: TaskAttempt;
}) {
  const tasks = useTaskLearning();
  const catalog = useLexicalCatalog();
  const [answer, setAnswer] = useState(attempt.answer);
  const [saveError, setSaveError] = useState(false);
  const schedule = tasks.schedules.find(
    (item) =>
      item.item.id ===
      createReviewIdentity(
        task.target,
        task.skill,
        task.promptFamily,
        attempt.startedAt,
      ).id,
  );
  const rated = tasks.state.scheduleEvents.some(
    (event) => event.kind === "rating" && event.attemptId === attempt.id,
  );
  const observationId = `observation:${attempt.id}`;
  const observation = tasks.observations.find(
    (item) => item.id === observationId,
  );
  const challenged = tasks.state.challenges.some(
    (item) => item.observationId === observationId,
  );
  const evaluated = attempt.status === "evaluated";
  function persist(value: string) {
    setAnswer(value);
    setSaveError(!tasks.saveAnswer(attempt.id, value));
  }
  return (
    <section className={styles.card} aria-label="Skill practice task">
      <p className="eyebrow">
        {task.skill} ·{" "}
        {attempt.assistance.hintIds.length ? "With a hint" : "No hint used"}
      </p>
      <h2>{task.prompt}</h2>
      {!evaluated ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            tasks.submitTask(attempt.id, answer);
          }}
        >
          {task.format === "recognition" ? (
            <fieldset className={styles.choices}>
              <legend>Choose one definition</legend>
              {catalogRecognitionChoices(task, catalog.entries).map(
                (choice) => (
                  <label key={choice}>
                    <input
                      type="radio"
                      name={attempt.id}
                      value={choice}
                      checked={answer === choice}
                      onChange={() => persist(choice)}
                    />
                    {choice}
                  </label>
                ),
              )}
            </fieldset>
          ) : (
            <label className={styles.answer}>
              Your answer
              <textarea
                value={answer}
                maxLength={8_000}
                onChange={(event) => persist(event.target.value)}
              />
            </label>
          )}
          <p className={styles.status} role="status">
            {saveError
              ? "Answer could not be saved. Keep this page open and retry."
              : "Answer saved on this device."}
          </p>
          <div className={styles.actions}>
            <button
              className="button primary"
              disabled={!answer.trim() || saveError}
            >
              Submit answer
            </button>
            {task.hints.map((hint) => (
              <button
                key={hint.id}
                type="button"
                className="button secondary"
                disabled={attempt.assistance.hintIds.includes(hint.id)}
                onClick={() =>
                  tasks.revealHelp(attempt.id, {
                    kind: "hint",
                    hintId: hint.id,
                  })
                }
              >
                Show first-letter hint
              </button>
            ))}
          </div>
          {task.hints
            .filter((hint) => attempt.assistance.hintIds.includes(hint.id))
            .map((hint) => (
              <p key={hint.id}>{hint.text}</p>
            ))}
        </form>
      ) : (
        <div>
          <p>
            <strong>
              {attempt.evaluation?.outcome === "accepted"
                ? "Accepted for this task"
                : attempt.evaluation?.outcome === "partial"
                  ? "Partially accepted"
                  : attempt.evaluation?.outcome === "uncertain"
                    ? "Saved without an assessment"
                    : "Not yet, for this task"}
            </strong>
          </p>
          <blockquote>{attempt.answer}</blockquote>
          <p>{attempt.evaluation?.explanation}</p>
          <p className={styles.status}>
            {observation
              ? `${observation.independent ? "Independent" : "Assisted"} ${task.skill} observation. It does not update any other skill.`
              : "No competence observation or automatic lapse was created."}
          </p>
          {observation && (
            <button
              className="button ghost"
              disabled={challenged}
              onClick={() =>
                tasks.challenge(
                  observationId,
                  "Learner requests review of this task assessment.",
                )
              }
            >
              {challenged
                ? "Excluded from active estimates"
                : "Challenge this assessment"}
            </button>
          )}
          {observation && !challenged && schedule && (
            <div>
              <p>Your scheduling rating · How difficult was retrieval?</p>
              <div className={styles.actions}>
                {ratingLabels.map((rating) => (
                  <button
                    key={rating}
                    className="button secondary small"
                    disabled={rated}
                    onClick={() =>
                      tasks.recordRating(schedule.item.id, rating, attempt.id)
                    }
                  >
                    {rating[0].toUpperCase() + rating.slice(1)}
                  </button>
                ))}
              </div>
              {rated && (
                <p role="status">
                  Scheduling rating saved. Next due:{" "}
                  {new Date(schedule.card.due).toLocaleString()}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
