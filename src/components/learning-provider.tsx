"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  emptyState,
  saveSense,
  reviewSense,
  disputeEvidence,
  type LearningState,
  type Rating,
} from "@/domain";
import {
  BrowserLearningRepository,
  STORAGE_KEY,
} from "@/infrastructure/storage/browser-repository";

interface LearningContextValue {
  state: LearningState;
  ready: boolean;
  error: string | null;
  save: (senseId: string, context: string) => boolean;
  review: (senseId: string, rating: Rating) => boolean;
  dispute: (evidenceId: string) => boolean;
  setReaderProgress: (percent: number) => boolean;
  reset: () => boolean;
}
const LearningContext = createContext<LearningContextValue | null>(null);
export function LearningProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LearningState>(emptyState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(state);
  const serialized = useRef<string | null>(null);
  const repository = useRef<BrowserLearningRepository | null>(null);
  const blocked = useRef(false);
  useEffect(() => {
    const read = () => {
      try {
        const repo = new BrowserLearningRepository(window.localStorage);
        const loaded = repo.read();
        repository.current = repo;
        serialized.current = loaded.serialized;
        current.current = loaded.state;
        setState(loaded.state);
        blocked.current = false;
        setError(null);
      } catch {
        blocked.current = true;
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
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const commit = useCallback(
    (update: (previous: LearningState) => LearningState) => {
      if (!repository.current || blocked.current) return false;
      try {
        const next = update(current.current);
        serialized.current = repository.current.commit(
          next,
          serialized.current,
        );
        current.current = next;
        setState(next);
        setError(null);
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error && cause.message.includes("another tab")
            ? cause.message
            : "This change could not be saved on this device. Check available storage or browser privacy settings and try again.",
        );
        return false;
      }
    },
    [],
  );
  const reset = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      repository.current = new BrowserLearningRepository(window.localStorage);
      serialized.current = null;
      current.current = emptyState();
      blocked.current = false;
      setState(current.current);
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
        save: (id, context) =>
          commit((previous) => saveSense(previous, id, context, new Date())),
        review: (id, rating) =>
          commit((previous) =>
            reviewSense(previous, id, rating, new Date(), crypto.randomUUID()),
          ),
        dispute: (id) =>
          commit((previous) => disputeEvidence(previous, id, new Date())),
        setReaderProgress: (percent) =>
          commit((previous) => ({
            ...previous,
            readerProgress: Math.min(100, Math.max(0, percent)),
          })),
        reset,
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
