"use client";
import { subscribeToProfileRestore } from "@/infrastructure/materials/purge-signal";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { LOCAL_PURGE_MARKER } from "@/infrastructure/storage/preferences";
import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface OfflineContext {
  blocked: boolean;
  ready: boolean;
  busy: boolean;
  offline: boolean;
  error: string;
  update: boolean;
  installable: boolean;
  enable(): Promise<void>;
  install(): Promise<void>;
  applyUpdate(): void;
}
const Context = createContext<OfflineContext | null>(null);
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [update, setUpdate] = useState(false);
  const [installable, setInstallable] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const prompt = useRef<InstallPrompt | null>(null);
  const reloadOnChange = useRef(false);
  const purged = useRef(false);
  const activeSetup = useRef<Promise<void> | null>(null);
  const listeners = useRef<Array<() => void>>([]);
  const enable = useCallback((): Promise<void> => {
    if (activeSetup.current) return activeSetup.current;
    const setup = async () => {
      if (!("serviceWorker" in navigator) || !window.isSecureContext) {
        setError(
          "Offline installation needs a supported browser and HTTPS (or localhost for development).",
        );
        return;
      }
      setBusy(true);
      setError("");
      try {
        assertLocalWritesAllowed(window.localStorage);
        if (purged.current) return;
        const next = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (purged.current) return;
        assertLocalWritesAllowed(window.localStorage);
        registration.current = next;
        const watch = (worker: ServiceWorker) => {
          const changed = () => {
            if (purged.current) return;
            if (worker.state === "activated") {
              setReady(true);
              setBusy(false);
            } else if (worker.state === "redundant") {
              setBusy(false);
              setError(
                "Offline setup could not finish. Keep your data and retry while connected.",
              );
            } else if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdate(true);
              setBusy(false);
            }
          };
          worker.addEventListener("statechange", changed);
          listeners.current.push(() =>
            worker.removeEventListener("statechange", changed),
          );
          changed();
        };
        if (next.active) {
          if (!(await window.caches.match("/offline"))) {
            const worker = next.active;
            await new Promise<void>((resolve, reject) => {
              const channel = new MessageChannel();
              const close = () => {
                clearTimeout(timer);
                channel.port1.close();
                channel.port2.close();
              };
              const timer = setTimeout(() => {
                close();
                reject(new Error("Offline preparation timed out."));
              }, 15000);
              channel.port1.onmessage = (event) => {
                close();
                if (event.data?.ok) resolve();
                else reject(new Error("Offline preparation failed."));
              };
              worker.postMessage({ type: "LEXIS_PREPARE_OFFLINE" }, [
                channel.port2,
              ]);
            });
          }
          if (purged.current) return;
          setReady(true);
          setBusy(false);
        }
        if (next.installing) watch(next.installing);
        if (next.waiting) {
          setUpdate(true);
          setBusy(false);
        }
        const found = () => {
          if (next.installing) watch(next.installing);
        };
        next.addEventListener("updatefound", found);
        listeners.current.push(() =>
          next.removeEventListener("updatefound", found),
        );
        localStorage.setItem("lexis.offline.enabled", "true");
      } catch {
        if (!purged.current)
          setError(
            "Offline setup is unavailable. Your learning data is unchanged; reconnect and retry.",
          );
        setBusy(false);
      }
    };
    activeSetup.current = setup().finally(() => {
      activeSetup.current = null;
    });
    return activeSetup.current;
  }, []);
  useEffect(() => {
    const ownedListeners = listeners.current;
    const onlineChanged = () => setOffline(!navigator.onLine);
    const installPrompt = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPrompt;
      setInstallable(true);
    };
    const installed = () => {
      prompt.current = null;
      setInstallable(false);
    };
    const controlled = () => {
      if (reloadOnChange.current && !purged.current) window.location.reload();
    };
    const purge = (event: Event) => {
      purged.current = true;
      reloadOnChange.current = false;
      prompt.current = null;
      listeners.current.splice(0).forEach((dispose) => dispose());
      setReady(false);
      setBusy(false);
      setUpdate(false);
      setInstallable(false);
      setBlocked(true);
      setError(
        "Offline changes are paused for local profile deletion. Finish in Settings, then start a fresh profile.",
      );
      // Drain registration before the deletion coordinator enumerates and stops workers.
      (
        event as CustomEvent<{ register?: (promise: Promise<unknown>) => void }>
      ).detail?.register?.(activeSetup.current ?? Promise.resolve());
    };
    const initialize = async () => {
      onlineChanged();
      try {
        if (localStorage.getItem(LOCAL_PURGE_MARKER)) {
          purge(new Event("lexis-local-purge"));
          return;
        }
        if (localStorage.getItem("lexis.offline.enabled") === "true")
          await enable();
      } catch {
        setError(
          "Browser storage is unavailable; offline preference could not be opened.",
        );
      }
    };
    void initialize();
    window.addEventListener("online", onlineChanged);
    window.addEventListener("offline", onlineChanged);
    window.addEventListener("beforeinstallprompt", installPrompt);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("lexis-local-purge", purge);
    const stopRestore = subscribeToProfileRestore(() => {
      purged.current = true;
      reloadOnChange.current = false;
      prompt.current = null;
      listeners.current.splice(0).forEach((dispose) => dispose());
      setReady(false);
      setBusy(false);
      setUpdate(false);
      setInstallable(false);
      setBlocked(true);
      setError(
        "Offline setup and app updates are paused for profile recovery. Finish recovery, then reopen LEXIS.",
      );
      return activeSetup.current ?? Promise.resolve();
    });
    navigator.serviceWorker?.addEventListener("controllerchange", controlled);
    return () => {
      window.removeEventListener("online", onlineChanged);
      window.removeEventListener("offline", onlineChanged);
      window.removeEventListener("beforeinstallprompt", installPrompt);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("lexis-local-purge", purge);
      stopRestore();
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controlled,
      );
      ownedListeners.splice(0).forEach((dispose) => dispose());
    };
  }, [enable]);
  return (
    <Context.Provider
      value={{
        blocked,
        ready,
        busy,
        offline,
        error,
        update,
        installable,
        enable,
        install: async () => {
          const request = prompt.current;
          if (!request || purged.current) return;
          await request.prompt();
          await request.userChoice;
          prompt.current = null;
          setInstallable(false);
        },
        applyUpdate: () => {
          if (!registration.current?.waiting || purged.current) return;
          reloadOnChange.current = true;
          registration.current.waiting.postMessage({
            type: "LEXIS_APPLY_UPDATE",
          });
        },
      }}
    >
      {offline && (
        <p role="status" className="status-banner">
          You are offline.{" "}
          <a href="/offline">Open the local offline workspace</a>. AI and cloud
          actions need a connection.
        </p>
      )}
      {children}
    </Context.Provider>
  );
}
export function OfflineSettings() {
  const value = useContext(Context);
  if (!value) return null;
  return (
    <section className="device-panel" aria-label="Offline settings">
      <h2>Take a quiet space offline.</h2>
      <p>
        Opt in to a cached public app workspace. Imported texts and drafts
        remain in their local browser stores. Account pages, API responses and
        private media are never put into the service-worker cache.
      </p>
      <div className="device-actions">
        <button
          className="button secondary"
          disabled={value.busy || value.blocked}
          onClick={() => void value.enable()}
        >
          {value.busy
            ? "Preparing offline workspace…"
            : value.ready
              ? "Check offline workspace"
              : "Enable offline workspace"}
        </button>
        {value.installable && (
          <button
            className="button secondary"
            onClick={() => void value.install()}
          >
            Install LEXIS
          </button>
        )}
        {value.update && (
          <button className="button primary" onClick={value.applyUpdate}>
            Apply saved-workspace update
          </button>
        )}
      </div>
      {value.error && <p role="alert">{value.error}</p>}
      {value.ready && (
        <p role="status">Offline workspace prepared on this device.</p>
      )}
      <p className="muted">
        On iPhone Safari: Share → Add to Home Screen. Installation availability
        depends on your browser. Save your work before applying an update.
        Browser storage can be cleared or evicted; keep exported backups.
      </p>
      <p>
        <a href="/offline">Open offline workspace</a> ·{" "}
        <Link href="/core/restore">Learning restore</Link>
      </p>
    </section>
  );
}
