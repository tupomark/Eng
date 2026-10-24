"use client";
import {
  assertLocalWritesAllowed,
  suspendLocalWrites,
} from "@/infrastructure/storage/local-write-guard";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  TaskSession,
  taskSchedules,
  legacyScheduleExclusions,
  type LegacyMigrationPreview,
  type TaskRestorePreview,
} from "@/application/task-session";
import {
  emptyTaskLearningState,
  taskObservations,
  type TaskLearningState,
} from "@/domain/tasks/state";
import type {
  TaskAttempt,
  TaskDefinition,
  TaskObservation,
} from "@/domain/tasks/types";
import type { LearningState, Rating } from "@/domain";
import {
  selectFsrsQueue,
  type FsrsSchedule,
  type ReviewIdentity,
} from "@/domain/scheduling";
import {
  BrowserTaskRepository,
  TASK_STORAGE_KEY,
} from "@/infrastructure/storage/browser-task-repository";
import { useLearning } from "./learning-provider";
import {
  ASSESSMENT_WITHDRAWAL_POLICIES,
  applyAssessmentWithdrawals,
  withdrawnTaskDefinition,
} from "@/application/assessment-withdrawals";

type Help =
  { kind: "hint"; hintId: string } | { kind: "answer" | "transcript" };

interface TaskLearningContextValue {
  state: TaskLearningState;
  observations: TaskObservation[];
  schedules: FsrsSchedule[];
  dueSchedules: FsrsSchedule[];
  ready: boolean;
  decisionsBlocked: boolean;
  error: string | null;
  startTask(task: TaskDefinition): TaskAttempt | null;
  saveAnswer(attemptId: string, answer: string): TaskAttempt | null;
  submitTask(attemptId: string, answer: string): TaskAttempt | null;
  revealHelp(attemptId: string, help: Help): TaskAttempt | null;
  challenge(observationId: string, reason: string): boolean;
  ensureReviewItem(item: ReviewIdentity): boolean;
  recordRating(
    itemId: string,
    rating: Rating,
    attemptId?: string,
    eventId?: string,
  ): boolean;
  postpone(itemId: string, dueAt: string): boolean;
  archive(itemId: string, archived: boolean): boolean;
  previewLegacy(state: LearningState): LegacyMigrationPreview | null;
  importLegacy(preview: LegacyMigrationPreview): boolean;
  exportData(): string | null;
  previewRestore(serialized: string): TaskRestorePreview | null;
  confirmRestore(preview: TaskRestorePreview): boolean;
  resetTaskData(confirmed: boolean): boolean;
  reload(): void;
}

const Context = createContext<TaskLearningContextValue | null>(null);

function createSession() {
  return new TaskSession(new BrowserTaskRepository(window.localStorage), {
    now: () => new Date().toISOString(),
    createId: () => crypto.randomUUID(),
  });
}

export function TaskLearningProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    now,
    setReviewDeadline,
    state: legacyState,
    ready: legacyReady,
    error: legacyError,
  } = useLearning();
  const [rawState, setState] = useState<TaskLearningState>(
    emptyTaskLearningState,
  );
  const state = useMemo(
    () => applyAssessmentWithdrawals(rawState, ASSESSMENT_WITHDRAWAL_POLICIES),
    [rawState],
  );
  const [ready, setReady] = useState(false);
  const [readable, setReadable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<TaskSession | null>(null);
  const reload = useCallback(() => {
    try {
      assertLocalWritesAllowed(window.localStorage);
      session.current ??= createSession();
      setState(session.current.load());
      setReadable(true);
      setError(null);
    } catch {
      setReadable(false);
      setError(
        "Your local practice data could not be opened. It has been preserved. Export a backup before recovery, or reload to try again.",
      );
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    reload();
    const sync = (event: StorageEvent) => {
      if (event.key === TASK_STORAGE_KEY || event.key === null) reload();
    };
    const purge = () => {
      suspendLocalWrites();
      session.current = null;
      setState(emptyTaskLearningState());
      setReadable(false);
      setError(
        "Practice is paused for local profile deletion. Finish in Settings, then start fresh.",
      );
    };
    window.addEventListener("storage", sync);
    window.addEventListener("lexis-local-purge", purge);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lexis-local-purge", purge);
    };
  }, [reload]);
  const run = useCallback(
    <T,>(command: (current: TaskSession) => T): T | null => {
      if (!session.current) return null;
      try {
        session.current.reconcileAssessmentPolicies(
          ASSESSMENT_WITHDRAWAL_POLICIES,
        );
        const result = command(session.current);
        setState(session.current.state!);
        setError(null);
        return result;
      } catch (cause) {
        if (session.current?.state) setState(session.current.state);
        const message = cause instanceof Error ? cause.message : "";
        setError(
          /another tab|already|different|unassessed|challenged|archived|backup|migration preview|Reload|conflicting|could not be found|predate|past due|limit/.test(
            message,
          )
            ? message
            : "This practice change could not be saved. Your previous data is intact. Check browser storage and try again.",
        );
        return null;
      }
    },
    [],
  );
  const observations = useMemo(() => taskObservations(state), [state]);
  const extraExclusions = useMemo(
    () =>
      legacyReady && !legacyError
        ? legacyScheduleExclusions(state, legacyState)
        : [],
    [state, legacyState, legacyReady, legacyError],
  );
  // Rebuild immediately from the valid legacy challenge; never expose its stale penalty
  // while the second local store is being reconciled or a write needs retrying.
  const schedules = useMemo(
    () => taskSchedules(state, extraExclusions),
    [state, extraExclusions],
  );
  const legacyBlocked = !!legacyError && state.legacyBackups.length > 0;
  const assessmentPending = state !== rawState;
  const decisionsBlocked = !readable || legacyBlocked || assessmentPending;
  useEffect(() => {
    if (readable && assessmentPending)
      run((current) =>
        current.reconcileAssessmentPolicies(ASSESSMENT_WITHDRAWAL_POLICIES),
      );
  }, [readable, assessmentPending, rawState, run]);
  useEffect(() => {
    if (readable && legacyReady && !legacyError && extraExclusions.length)
      run((current) => current.reconcileLegacyDisputes(legacyState));
  }, [readable, legacyReady, legacyError, extraExclusions, legacyState, run]);
  const dueSchedules = useMemo(
    () =>
      decisionsBlocked
        ? []
        : selectFsrsQueue(schedules, now, {
            limit: 20,
            excludedItemIds: state.archivedItemIds,
          }),
    [schedules, now, state.archivedItemIds, decisionsBlocked],
  );
  const nextDeadline = Math.min(
    ...schedules.flatMap((schedule) =>
      !state.archivedItemIds.includes(schedule.item.id) &&
      Date.parse(schedule.card.due) > Date.parse(now)
        ? [Date.parse(schedule.card.due)]
        : [],
    ),
  );
  useEffect(() => {
    setReviewDeadline(
      "tasks",
      Number.isFinite(nextDeadline) ? nextDeadline : null,
    );
    return () => setReviewDeadline("tasks", null);
  }, [nextDeadline, setReviewDeadline]);
  const success = (command: (current: TaskSession) => TaskLearningState) =>
    run(command) !== null;
  return (
    <Context.Provider
      value={{
        state,
        observations,
        schedules,
        dueSchedules,
        ready,
        decisionsBlocked,
        error:
          error ??
          (legacyBlocked
            ? "Imported review is paused because the original learning history could not be opened. Reload or recover that data before continuing."
            : null),
        startTask: (task) => {
          if (withdrawnTaskDefinition(task, ASSESSMENT_WITHDRAWAL_POLICIES)) {
            setError(
              "This assessment was withdrawn because it did not measure the intended meaning. Start the revised task instead.",
            );
            return null;
          }
          return run((current) => current.startTask(task));
        },
        saveAnswer: (id, answer) =>
          run((current) => current.saveAnswer(id, answer)),
        submitTask: (id, answer) =>
          run((current) => current.submitTask(id, answer)),
        revealHelp: (id, help) =>
          run((current) => current.revealHelp(id, help)),
        challenge: (id, reason) =>
          success((current) => current.challenge(id, reason)),
        ensureReviewItem: (item) =>
          success((current) => current.ensureReviewItem(item)),
        recordRating: (id, rating, attemptId, eventId) => {
          if (decisionsBlocked) {
            setError(
              "Review decisions are paused until your learning data can be opened safely. Reload or recover the preserved data.",
            );
            return false;
          }
          return success((current) =>
            current.recordRating(id, rating, attemptId, eventId),
          );
        },
        postpone: (id, dueAt) =>
          success((current) => current.postpone(id, dueAt)),
        archive: (id, archived) =>
          success((current) => current.archive(id, archived)),
        previewLegacy: (legacy) =>
          run((current) => current.previewLegacy(legacy)),
        importLegacy: (preview) =>
          success((current) => current.importLegacy(preview)),
        previewRestore: (serialized) =>
          run((current) => current.previewRestore(serialized)),
        confirmRestore: (preview) =>
          success((current) => current.confirmRestore(preview)),
        exportData: () => {
          try {
            return (
              window.localStorage.getItem(TASK_STORAGE_KEY) ??
              JSON.stringify(emptyTaskLearningState())
            );
          } catch {
            setError(
              "Browser storage is unavailable. No backup could be read.",
            );
            return null;
          }
        },
        resetTaskData: (confirmed) => {
          if (!confirmed) return false;
          try {
            assertLocalWritesAllowed(window.localStorage);
            window.localStorage.removeItem(TASK_STORAGE_KEY);
            const next = createSession();
            const loaded = next.load();
            session.current = next;
            setState(loaded);
            setReadable(true);
            setError(null);
            return true;
          } catch {
            setError(
              "Practice data could not be reset. Browser storage is unavailable.",
            );
            return false;
          }
        },
        reload,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useTaskLearning(): TaskLearningContextValue {
  const context = useContext(Context);
  if (!context) throw new Error("TaskLearningProvider is required.");
  return context;
}
