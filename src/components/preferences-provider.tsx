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
  DEFAULT_PREFERENCES,
  type PreferenceChange,
  type Preferences,
} from "@/domain/preferences/preferences";
import {
  LOCAL_PURGE_MARKER,
  PREFERENCES_KEY,
  PreferencesRepository,
} from "@/infrastructure/storage/preferences";
import { suspendLocalWrites } from "@/infrastructure/storage/local-write-guard";
import "./preferences-motion.css";
import { subscribeToProfileRestore } from "@/infrastructure/materials/purge-signal";

interface PreferencesValue {
  preferences: Preferences;
  ready: boolean;
  error: string | null;
  change(change: PreferenceChange): boolean;
  reload(): void;
}
const Context = createContext<PreferencesValue | null>(null);

/** Notify mounted workspaces; cleanup handlers may register a promise to drain writes. */
function forwardPurge() {
  suspendLocalWrites();
  const pending: Promise<unknown>[] = [];
  window.dispatchEvent(
    new CustomEvent("lexis-local-purge", {
      detail: {
        register: (promise: Promise<unknown>) => {
          pending.push(promise);
        },
      },
    }),
  );
  // sessionStorage belongs to each tab; a remote tab must clear its own contexts.
  void Promise.allSettled(pending).then(() => {
    try {
      const keys = Array.from(
        { length: window.sessionStorage.length },
        (_, index) => window.sessionStorage.key(index),
      );
      for (const key of keys)
        if (key?.startsWith("lexis.")) window.sessionStorage.removeItem(key);
    } catch {
      /* A blocked tab remains paused. The initiating tab reports the close-tabs limitation. */
    }
  });
}

export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [preferences, setPreferences] = useState<Preferences>({
    ...DEFAULT_PREFERENCES,
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repository = useRef<PreferencesRepository | null>(null);
  const paused = useRef(false);
  const reload = useCallback(() => {
    try {
      repository.current = new PreferencesRepository(window.localStorage);
      setPreferences(repository.current.read());
      setError(null);
    } catch {
      repository.current = null;
      setError(
        "Your saved preferences could not be opened and have been preserved. Export a copy before recovery; new choices have not been saved.",
      );
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    reload();
    const stop = () => {
      paused.current = true;
      suspendLocalWrites();
      setError(
        "Local data removal has paused this page. Finish deletion in Settings, then start a fresh local profile.",
      );
    };
    const sync = (event: StorageEvent) => {
      if (event.key === LOCAL_PURGE_MARKER && event.newValue) forwardPurge();
      if (event.key === PREFERENCES_KEY || event.key === null) reload();
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("lexis-local-purge");
    if (channel)
      channel.onmessage = (event) => {
        if (event.data?.type === "prepare") forwardPurge();
      };
    window.addEventListener("storage", sync);
    window.addEventListener("lexis-local-purge", stop);
    const stopRestore = subscribeToProfileRestore(() => {
      paused.current = true;
      repository.current = null;
      setError(
        "Preferences are paused for profile recovery. Finish recovery, then reopen LEXIS to use the restored profile.",
      );
    });
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("lexis-local-purge", stop);
      stopRestore();
      channel?.close();
    };
  }, [reload]);
  useEffect(() => {
    document.documentElement.dataset.lexisMotion = preferences.reducedMotion;
    document.documentElement.dataset.lexisUiLanguage = preferences.uiLanguage;
  }, [preferences.reducedMotion, preferences.uiLanguage]);
  const change = (update: PreferenceChange) => {
    try {
      if (paused.current)
        throw new Error(
          "This page is paused for a local profile operation. Finish it, then reopen LEXIS before changing preferences.",
        );
      if (!repository.current)
        throw new Error(
          "Readable preferences are required before making changes.",
        );
      const next = repository.current.change(update);
      setPreferences(next);
      setError(null);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This choice could not be saved. Your previous preferences remain active.",
      );
      return false;
    }
  };
  return (
    <Context.Provider value={{ preferences, ready, error, change, reload }}>
      {children}
    </Context.Provider>
  );
}

export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("PreferencesProvider is required.");
  return value;
}
