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
  useSyncExternalStore,
} from "react";
import {
  deriveProgress,
  emptyState,
  type LearningState,
  type Rating,
} from "@/domain";
import { createBrowserClock } from "@/infrastructure/storage/browser-clock";
import { LearningSession } from "@/application/learning-session";
import {
  BrowserLearningRepository,
  STORAGE_KEY,
} from "@/infrastructure/storage/browser-repository";
import { subscribeToProfileRestore } from "@/infrastructure/materials/purge-signal";

interface LearningContextValue {
  state: LearningState;
  ready: boolean;
  error: string | null;
  now: string;
  progress: ReturnType<typeof deriveProgress>;
  setReviewDeadline: (source: string, deadline: number | null) => void;
  save: (senseId: string, context: string) => boolean;
  undoSave: (senseId: string) => boolean;
  canUndoSave: (senseId: string) => boolean;
  review: (senseId: string, rating: Rating) => boolean;
  dispute: (evidenceId: string) => boolean;
  setReaderProgress: (percent: number) => boolean;
  reset: () => boolean;
  restore: (merged: LearningState) => boolean;
}
const LearningContext = createContext<LearningContextValue | null>(null);
function createSession() {
  return new LearningSession(
    new BrowserLearningRepository(window.localStorage),
    { now: () => new Date(), createId: () => crypto.randomUUID() },
  );
}
export function LearningProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LearningState>(emptyState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock] = useState(createBrowserClock);
  const timestamp = useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    clock.getServerSnapshot,
  );
  const now = new Date(timestamp).toISOString();
  const progress = useMemo(() => deriveProgress(state), [state]);
  const setReviewDeadline = useCallback(
    (source: string, deadline: number | null) =>
      clock.setDeadline(deadline, source),
    [clock],
  );
  const deadline = Math.min(
    ...progress.flatMap((item) =>
      item.dueAt && Date.parse(item.dueAt) > timestamp
        ? [Date.parse(item.dueAt)]
        : [],
    ),
  );
  useEffect(() => {
    clock.setDeadline(Number.isFinite(deadline) ? deadline : null);
  }, [clock, deadline]);
  const session = useRef<LearningSession | null>(null);
  const undoableSaves = useRef(new Set<string>());
  useEffect(() => {
    const read = () => {
      try {
        assertLocalWritesAllowed(window.localStorage);
        session.current ??= createSession();
        setState(session.current.load());
        undoableSaves.current.clear();
        setError(null);
      } catch {
        setError(
          "Your local data could not be opened. It has been kept intact. Open Core to export a backup or reset this device.",
        );
      } finally {
        setReady(true);
      }
    };
    read();
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) read();
    };
    const purge = () => {
      suspendLocalWrites();
      session.current = null;
      undoableSaves.current.clear();
      setState(emptyState());
      setError(
        "Local profile changes are paused for deletion. Finish in Settings, then start fresh.",
      );
    };
    window.addEventListener("storage", sync);
    window.addEventListener("lexis-local-purge", purge);
    const stopRestore = subscribeToProfileRestore(() => {
      session.current = null;
      undoableSaves.current.clear();
      setError(
        "Learning changes are paused for profile recovery. Existing history is preserved. Finish recovery, then reopen LEXIS.",
      );
    });
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lexis-local-purge", purge);
      stopRestore();
    };
  }, []);
  const run = useCallback(
    (command: (current: LearningSession) => LearningState) => {
      if (!session.current) return false;
      try {
        const next = command(session.current);
        setState(next);
        setError(null);
        return true;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        setError(
          /another tab|evidence|before making changes|during this visit/.test(
            message,
          )
            ? message
            : "This change could not be saved on this device. Check available storage or browser privacy settings and try again.",
        );
        return false;
      }
    },
    [],
  );
  const reset = () => {
    try {
      assertLocalWritesAllowed(window.localStorage);
      window.localStorage.removeItem(STORAGE_KEY);
      const next = createSession();
      const loaded = next.load();
      session.current = next;
      undoableSaves.current.clear();
      setState(loaded);
      setError(null);
      return true;
    } catch {
      setError("Browser storage is unavailable. Your data has not been reset.");
      return false;
    }
  };
  return (
    <LearningContext.Provider
      value={{
        state,
        ready,
        error,
        now,
        progress,
        setReviewDeadline,
        save: (id, context) => {
          const alreadySaved = session.current?.state?.saved.some(
            (saved) => saved.senseId === id,
          );
          const saved = run((current) => current.saveMeaning(id, context));
          if (saved && !alreadySaved) undoableSaves.current.add(id);
          return saved;
        },
        undoSave: (id) => {
          const undone = run((current) => {
            if (!undoableSaves.current.has(id))
              throw new Error(
                "Only a meaning saved during this visit can be undone.",
              );
            return current.undoSave(id);
          });
          if (undone) undoableSaves.current.delete(id);
          return undone;
        },
        canUndoSave: (id) =>
          undoableSaves.current.has(id) &&
          !state.evidence.some((item) => item.senseId === id),
        review: (id, rating) =>
          run((current) => current.recordReview(id, rating)),
        dispute: (id) => run((current) => current.dispute(id)),
        setReaderProgress: (percent) =>
          run((current) => current.updateReaderProgress(percent)),
        reset,
        restore: (merged) =>
          run((current) => current.restoreMergedState(merged)),
      }}
    >
      {children}
    </LearningContext.Provider>
  );
}
export function useLearning() {
  const context = useContext(LearningContext);
  if (!context) throw new Error("LearningProvider is required");
  return context;
}
