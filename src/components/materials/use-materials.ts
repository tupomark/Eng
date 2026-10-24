"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyMaterialsState,
  type MaterialsState,
} from "@/domain/materials/types";
import {
  MATERIALS_STORAGE_KEY,
  MaterialsRepository,
} from "@/infrastructure/materials/materials-repository";
import { subscribeToLocalPurge } from "@/infrastructure/materials/purge-signal";

const LOCAL_EVENT = "lexis:materials-changed";
export function useMaterials() {
  const [state, setState] = useState(emptyMaterialsState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<MaterialsState>(state);
  const repository = useRef<MaterialsRepository | null>(null);
  const expected = useRef<string | null>(null);
  const readable = useRef(false);
  const purged = useRef(false);
  useEffect(() => {
    const load = () => {
      if (purged.current) return;
      try {
        repository.current ??= new MaterialsRepository(window.localStorage);
        const snapshot = repository.current.read();
        current.current = snapshot.state;
        expected.current = snapshot.serialized;
        readable.current = true;
        setState(snapshot.state);
        setError(null);
      } catch {
        readable.current = false;
        setError(
          "Your materials could not be opened. Their original data is preserved. Download a raw backup before attempting recovery.",
        );
      } finally {
        setReady(true);
      }
    };
    const sync = (event: StorageEvent) => {
      if (event.key === MATERIALS_STORAGE_KEY || event.key === null) load();
    };
    load();
    window.addEventListener("storage", sync);
    window.addEventListener(LOCAL_EVENT, load);
    const unsubscribePurge = subscribeToLocalPurge(() => {
      purged.current = true;
      readable.current = false;
      current.current = emptyMaterialsState();
      setState(current.current);
      setError(
        "Local materials have been paused for deletion. Reopen LEXIS after removal completes.",
      );
    });
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(LOCAL_EVENT, load);
      unsubscribePurge();
    };
  }, []);
  const update = useCallback(
    (command: (state: MaterialsState) => MaterialsState) => {
      if (!repository.current || !readable.current) {
        setError(
          "Saved materials must be opened successfully before changes can be made. Existing data has not been replaced.",
        );
        return false;
      }
      try {
        const next = command(current.current);
        expected.current = repository.current.commit(next, expected.current);
        current.current = next;
        setState(next);
        setError(null);
        window.dispatchEvent(new Event(LOCAL_EVENT));
        return true;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        setError(
          /another tab|conflict|supports 30|limit|Nothing has been restored/u.test(
            message,
          )
            ? message
            : "This change could not be saved. Your previous materials are intact and your input is still here. Check browser storage and retry.",
        );
        return false;
      }
    },
    [],
  );
  return { state, ready, error, update };
}

export function downloadLocalJson(name: string, data: string): void {
  const href = URL.createObjectURL(
    new Blob([data], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
