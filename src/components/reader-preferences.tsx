"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Modal } from "./modal";

const PREFERENCES_KEY = "lexis.reader.preferences.v1";

interface ReaderPreferences {
  version: 1;
  font: "sans" | "serif";
  fontSize: 18 | 20 | 23;
  lineSpacing: "comfortable" | "roomy";
}

const defaults: ReaderPreferences = {
  version: 1,
  font: "sans",
  fontSize: 20,
  lineSpacing: "comfortable",
};

function parsePreferences(raw: string): ReaderPreferences {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid reading preferences.");
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 4 ||
    record.version !== 1 ||
    (record.font !== "sans" && record.font !== "serif") ||
    (record.fontSize !== 18 &&
      record.fontSize !== 20 &&
      record.fontSize !== 23) ||
    (record.lineSpacing !== "comfortable" && record.lineSpacing !== "roomy")
  )
    throw new Error("Invalid reading preferences.");
  return {
    version: 1,
    font: record.font,
    fontSize: record.fontSize,
    lineSpacing: record.lineSpacing,
  };
}

export function useReaderPreferences() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(defaults);
  const [error, setError] = useState<string | null>(null);
  const [invalidStoredPreferences, setInvalidStoredPreferences] =
    useState(false);
  const current = useRef(preferences);
  const blocked = useRef(false);

  useEffect(() => {
    const read = () => {
      let raw: string | null;
      try {
        raw = window.localStorage.getItem(PREFERENCES_KEY);
      } catch {
        setError(
          "Reading options cannot be saved in this browser. Your choices will apply for this visit.",
        );
        return;
      }
      try {
        const loaded = raw === null ? defaults : parsePreferences(raw);
        current.current = loaded;
        setPreferences(loaded);
        blocked.current = false;
        setInvalidStoredPreferences(false);
        setError(null);
      } catch {
        blocked.current = true;
        setInvalidStoredPreferences(true);
        setError(
          "Saved reading options could not be opened and have been preserved. Reset reading options to save new choices. Learning data is separate.",
        );
      }
    };
    read();
    const sync = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY || event.key === null) read();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function change(next: Partial<Omit<ReaderPreferences, "version">>) {
    const updated = { ...current.current, ...next };
    current.current = updated;
    setPreferences(updated);
    if (blocked.current) return;
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(updated));
      setError(null);
    } catch {
      setError(
        "These reading options apply for this visit, but could not be saved on this device.",
      );
    }
  }

  function reset() {
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(defaults));
      current.current = defaults;
      setPreferences(defaults);
      blocked.current = false;
      setInvalidStoredPreferences(false);
      setError(null);
    } catch {
      setError(
        "Reading options could not be reset. Existing learning data and saved reading options have been kept.",
      );
    }
  }

  return { preferences, error, invalidStoredPreferences, change, reset };
}

export function ReaderOptions({
  preferences,
  error,
  invalidStoredPreferences,
  change,
  reset,
}: ReturnType<typeof useReaderPreferences>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="button ghost reader-options-button"
        onClick={() => setOpen(true)}
        aria-label="Reading options"
        aria-haspopup="dialog"
      >
        <SlidersHorizontal size={17} />
        <span>Reading options</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Reading options"
        className="reader-options-modal"
      >
        <p className="muted">
          A comfortable page, in your own rhythm. Choices stay on this device.
        </p>
        <fieldset className="reader-option-group">
          <legend>Typeface</legend>
          {(["sans", "serif"] as const).map((font) => (
            <label className="reader-option-choice" key={font}>
              <input
                type="radio"
                name="reader-font"
                value={font}
                checked={preferences.font === font}
                onChange={() => change({ font })}
              />
              <span>{font === "sans" ? "Sans serif" : "Serif"}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="reader-option-group">
          <legend>Text size</legend>
          {([18, 20, 23] as const).map((fontSize) => (
            <label className="reader-option-choice" key={fontSize}>
              <input
                type="radio"
                name="reader-font-size"
                value={fontSize}
                checked={preferences.fontSize === fontSize}
                onChange={() => change({ fontSize })}
              />
              <span>
                {fontSize === 18
                  ? "Small"
                  : fontSize === 20
                    ? "Medium"
                    : "Large"}{" "}
                · {fontSize}
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="reader-option-group">
          <legend>Line spacing</legend>
          {(["comfortable", "roomy"] as const).map((lineSpacing) => (
            <label className="reader-option-choice" key={lineSpacing}>
              <input
                type="radio"
                name="reader-line-spacing"
                value={lineSpacing}
                checked={preferences.lineSpacing === lineSpacing}
                onChange={() => change({ lineSpacing })}
              />
              <span>
                {lineSpacing === "comfortable" ? "Comfortable" : "Roomy"}
              </span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p className="status-banner error" role="alert">
            {error}
          </p>
        )}
        {invalidStoredPreferences && (
          <button className="button secondary" onClick={reset}>
            Reset reading options
          </button>
        )}
        <button className="button primary" onClick={() => setOpen(false)}>
          Back to reading
        </button>
      </Modal>
    </>
  );
}
