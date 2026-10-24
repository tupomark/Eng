"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { usePreferences } from "@/components/preferences-provider";
import { OfflineSettings } from "@/components/pwa";
import {
  parsePreferences,
  type Preferences,
} from "@/domain/preferences/preferences";
import { PREFERENCES_KEY } from "@/infrastructure/storage/preferences";
import {
  LOCAL_PURGE_CONFIRMATION,
  previewLocalProfile,
  purgeLocalProfile,
  restartLocalProfile,
  type LocalProfilePreview,
  type LocalProfilePurgeResult,
} from "@/infrastructure/storage/local-profile-purge";
import styles from "./settings.module.css";

function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function message(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

export function Settings() {
  const { preferences, ready, error, change, reload } = usePreferences();
  const [status, setStatus] = useState("");
  const [backupPreview, setBackupPreview] = useState<Preferences | null>(null);
  const russian = preferences.uiLanguage === "ru";
  const save: typeof change = (update) => {
    const saved = change(update);
    setStatus(
      saved
        ? russian
          ? "Сохранено на этом устройстве."
          : "Saved on this device."
        : "",
    );
    return saved;
  };
  async function previewPreferences(file: File) {
    setBackupPreview(null);
    setStatus("");
    try {
      if (file.size > 64 * 1024)
        throw new Error("Choose a preferences JSON file smaller than 64 KB.");
      const value = parsePreferences(JSON.parse(await file.text()));
      setBackupPreview(value);
    } catch (cause) {
      setStatus(
        message(
          cause,
          "This preferences file could not be opened. Existing choices are unchanged.",
        ),
      );
    }
  }
  return (
    <Shell title={russian ? "Настройки" : "Settings"}>
      <div className="page-heading">
        <p className="eyebrow">YOUR SPACE, YOUR PACE</p>
        <h1>{russian ? "Настройки" : "Make room for your way."}</h1>
        <p>
          {russian
            ? "Локальное пространство на этом устройстве. Язык объяснений и язык учебного ответа настраиваются отдельно."
            : "A local space on this device. Explanations and the language of a learning task are separate choices."}
        </p>
      </div>
      <div className={styles.stack}>
        {!preferences.onboardingCompleted && (
          <section
            className={`glass-panel ${styles.panel}`}
            aria-label="Getting started"
          >
            <h2>
              {russian
                ? "Начните с интересного вам."
                : "Begin with something that matters to you."}
            </h2>
            <p>
              No placement is required. Open your own material, try the clearly
              marked sample, or bring an existing word list. Adding material
              creates no score or compulsory review debt.
            </p>
            <div className={styles.actions}>
              <Link href="/library/import" className="button primary">
                Open your own text
              </Link>
              <Link href="/reader" className="button secondary">
                Try the sample
              </Link>
              <Link href="/goals" className="button secondary">
                Choose a goal
              </Link>
            </div>
            <button
              className="text-button"
              disabled={!ready || !!error}
              onClick={() => save({ onboardingCompleted: true })}
            >
              Keep these choices and dismiss this introduction
            </button>
          </section>
        )}
        <section
          className={`glass-panel ${styles.panel}`}
          aria-label="Language and learning preferences"
        >
          <h2>{russian ? "Язык и ритм" : "Language and rhythm"}</h2>
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button className="button secondary" onClick={reload}>
                Reload preferences
              </button>
            </div>
          )}
          <div className={styles.grid}>
            <label className={styles.field}>
              {russian ? "Язык интерфейса" : "Interface language"}
              <select
                data-testid="interface-language"
                className={styles.select}
                value={preferences.uiLanguage}
                disabled={!ready || !!error}
                onChange={(event) =>
                  save({
                    uiLanguage: event.target.value as Preferences["uiLanguage"],
                  })
                }
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="mixed">
                  Mixed · English with Russian assistance
                </option>
              </select>
            </label>
            <label className={styles.field}>
              {russian ? "Язык объяснений" : "Explanation language"}
              <select
                data-testid="explanation-language"
                className={styles.select}
                value={preferences.explanationLanguage}
                disabled={!ready || !!error}
                onChange={(event) =>
                  save({
                    explanationLanguage: event.target
                      .value as Preferences["explanationLanguage"],
                  })
                }
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
                <option value="mixed">English + Русский</option>
              </select>
            </label>
            <label className={styles.field}>
              {russian ? "Режим практики" : "Practice mode"}
              <select
                className={styles.select}
                value={preferences.learningMode}
                disabled={!ready || !!error}
                onChange={(event) =>
                  save({
                    learningMode: event.target
                      .value as Preferences["learningMode"],
                  })
                }
              >
                <option value="quick">Quick · a short visit</option>
                <option value="focused">Focused · a structured session</option>
                <option value="free">Free Exploration · choose freely</option>
                <option value="goal">
                  Goal Training · task queue not configured
                </option>
              </select>
            </label>
            <label className={styles.field}>
              {russian
                ? "Желаемый объём в день"
                : "Preferred daily practice items"}
              <select
                className={styles.select}
                value={preferences.dailyItems}
                disabled={!ready || !!error}
                onChange={(event) =>
                  save({ dailyItems: Number(event.target.value) })
                }
              >
                {[...new Set([5, 10, 20, 30, 50, preferences.dailyItems])]
                  .sort((a, b) => a - b)
                  .map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.field}>
              {russian ? "Предпочтительный акцент" : "Preferred accent"}
              <select
                className={styles.select}
                value={preferences.accent}
                disabled={!ready || !!error}
                onChange={(event) =>
                  save({ accent: event.target.value as Preferences["accent"] })
                }
              >
                <option value="BrE">British English</option>
                <option value="AmE">American English</option>
              </select>
            </label>
            <label className={styles.field}>
              {russian
                ? "Подробность исправлений"
                : "Preferred correction intensity"}
              <select
                className={styles.select}
                value={preferences.correctionStyle}
                disabled={!ready || !!error}
                onChange={(event) =>
                  save({
                    correctionStyle: event.target
                      .value as Preferences["correctionStyle"],
                  })
                }
              >
                <option value="gentle">Gentle</option>
                <option value="balanced">Balanced</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>
          </div>
          <p className={styles.note}>
            Navigation and these settings support EN/RU; translation of other
            workspace labels remains partial. Grammar uses your explanation
            language, with a temporary alternative available beside each rule.
            Original books, drafts and task answers remain unchanged. Tasks
            currently ask for English. Accent and correction preferences do not
            connect a voice or AI service.
          </p>
          <div className={styles.actions}>
            <Link href="/learn/practice" className="button secondary">
              Open practice
            </Link>
            <Link href="/goals" className="text-button">
              Goals and evidence
            </Link>
          </div>
          {status && <p role="status">{status}</p>}
        </section>
        <section
          className={`glass-panel ${styles.panel}`}
          aria-label="Appearance and access"
        >
          <h2>{russian ? "Спокойное пространство" : "A quieter space"}</h2>
          <label className={styles.field}>
            {russian ? "Движение" : "Motion"}
            <select
              aria-label={russian ? "Движение" : "Motion"}
              className={styles.select}
              value={preferences.reducedMotion}
              disabled={!ready || !!error}
              onChange={(event) =>
                save({
                  reducedMotion: event.target
                    .value as Preferences["reducedMotion"],
                })
              }
            >
              <option value="system">Follow device preference</option>
              <option value="reduce">Reduce decorative motion</option>
            </select>
          </label>
          <p>
            Dark warm surfaces remain the shared visual direction. Reader
            typeface, size and spacing live beside the text. Due items stay
            available on Home; push reminders are not connected and no
            notification permission is requested here.
          </p>
          <div className={styles.actions}>
            <Link href="/reader" className="button secondary">
              Reader appearance
            </Link>
            <Link href="/account" className="text-button">
              Account and connected capabilities
            </Link>
          </div>
        </section>
        <OfflineSettings />
        <section
          className={`glass-panel ${styles.panel}`}
          aria-label="Preferences backup"
        >
          <h2>Keep a copy of your choices.</h2>
          <p>
            This small backup contains preferences only. Learning history,
            books, drafts and media use separate stores and exports.
          </p>
          <div className={styles.actions}>
            <button
              className="button secondary"
              onClick={() => {
                try {
                  downloadText(
                    localStorage.getItem(PREFERENCES_KEY) ??
                      JSON.stringify(preferences, null, 2),
                    "lexis-preferences.json",
                  );
                } catch {
                  setStatus(
                    "Preferences storage could not be read for export. Existing data is unchanged.",
                  );
                }
              }}
            >
              Export preferences / preserved original
            </button>
            <label className={styles.field}>
              Preview a preferences backup
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void previewPreferences(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {backupPreview && (
            <div className={styles.divider}>
              <h3>Review before applying</h3>
              <p>
                Interface: {backupPreview.uiLanguage} · explanations:{" "}
                {backupPreview.explanationLanguage} · mode:{" "}
                {backupPreview.learningMode} · daily items:{" "}
                {backupPreview.dailyItems}. Existing learning data will remain
                unchanged.
              </p>
              <div className={styles.actions}>
                <button
                  className="button primary"
                  disabled={!ready || !!error}
                  onClick={() => {
                    const {
                      version: _version,
                      revision: _revision,
                      taskLanguage: _task,
                      ...update
                    } = backupPreview;
                    void _version;
                    void _revision;
                    void _task;
                    if (save(update)) setBackupPreview(null);
                  }}
                >
                  Apply reviewed preferences
                </button>
                <button
                  className="button secondary"
                  onClick={() => setBackupPreview(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <p className={styles.note}>
            <Link href="/core">Learning history export</Link> ·{" "}
            <Link href="/learn/practice">Practice export and restore</Link> ·{" "}
            <Link href="/library">Materials export</Link> ·{" "}
            <Link href="/writing">Writing export</Link> ·{" "}
            <Link href="/goals">Goals export</Link>
          </p>
        </section>
        <LocalProfileRemoval />
      </div>
    </Shell>
  );
}

function LocalProfileRemoval() {
  const [preview, setPreview] = useState<LocalProfilePreview | null>(null);
  const [result, setResult] = useState<LocalProfilePurgeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [closedTabs, setClosedTabs] = useState(false);
  async function inspect() {
    setBusy(true);
    setError("");
    try {
      setPreview(await previewLocalProfile());
    } catch (cause) {
      setError(
        message(
          cause,
          "Browser storage could not be inspected. Nothing has been removed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void previewLocalProfile()
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch((cause) => {
        if (active)
          setError(
            message(
              cause,
              "Browser storage could not be inspected. Nothing has been removed.",
            ),
          );
      });
    return () => {
      active = false;
    };
  }, []);
  const completed = result?.complete || preview?.deletionStatus === "complete";
  return (
    <section
      className={`glass-panel ${styles.panel} ${styles.danger}`}
      aria-label="Remove local profile"
    >
      <h2>Remove this device’s local profile.</h2>
      <p>
        This permanently removes LEXIS learning history, saved meanings,
        imported texts, drafts, goals, practice, temporary contexts, local
        recordings, preferences and offline caches from this browser profile.
        Archive individual items if you want to keep their history. Cloud
        accounts and server data are a separate scope and are not deleted here.
      </p>
      <p>
        Export the separate stores above first. Close every other LEXIS tab
        before continuing; a suspended tab’s temporary storage cannot be
        verified from this page. Other devices, browser profiles and exported
        files are outside this action.
      </p>
      {preview && (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>Local records</dt>
              <dd>{preview.localKeys.length}</dd>
            </div>
            <div>
              <dt>Temporary contexts</dt>
              <dd>{preview.sessionKeys.length}</dd>
            </div>
            <div>
              <dt>Local databases</dt>
              <dd>{preview.databases.length}</dd>
            </div>
            <div>
              <dt>Offline caches</dt>
              <dd>{preview.caches.length}</dd>
            </div>
          </dl>
          {preview.warnings.length > 0 && (
            <ul className={styles.list}>
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {result?.failures.length ? (
        <div role="alert">
          <p>
            Deletion is incomplete. The remaining data is paused for safety;
            keep this page open, close other LEXIS tabs and retry.
          </p>
          <ul className={styles.list}>
            {result.failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {completed ? (
        <>
          <p role="status">
            The inspected local stores have been removed. This page stays paused
            until you start a fresh profile. No cloud deletion was performed.
          </p>
          <button
            className="button primary"
            onClick={() => {
              try {
                restartLocalProfile();
                // Full navigation discards every paused in-memory workspace before a new profile begins.
                window.location.assign(
                  new URL("/", window.location.origin).href,
                );
              } catch (cause) {
                setError(
                  message(
                    cause,
                    "A fresh profile could not be started. Retry deletion first.",
                  ),
                );
              }
            }}
          >
            Start a fresh local profile
          </button>
        </>
      ) : (
        <>
          {preview?.pending && (
            <p role="status">
              An earlier local deletion did not finish. Existing workspaces
              remain paused; retry to verify and remove the remaining stores.
            </p>
          )}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={closedTabs}
              onChange={(event) => setClosedTabs(event.target.checked)}
            />
            I have exported what I need and closed all other LEXIS tabs.
          </label>
          <label className={styles.field}>
            Type {LOCAL_PURGE_CONFIRMATION}
            <input
              className={styles.input}
              value={confirmation}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void inspect()}
            >
              Refresh deletion preview
            </button>
            <button
              className="button primary"
              disabled={
                busy ||
                !preview ||
                !closedTabs ||
                confirmation !== LOCAL_PURGE_CONFIRMATION
              }
              onClick={() => {
                setBusy(true);
                setError("");
                void purgeLocalProfile(confirmation)
                  .then((next) => {
                    setResult(next);
                    setPreview(next.remaining);
                  })
                  .catch((cause) =>
                    setError(
                      message(
                        cause,
                        "Deletion could not complete. Keep this page open and retry.",
                      ),
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {busy
                ? "Checking local stores…"
                : preview?.pending
                  ? "Retry confirmed local deletion"
                  : "Permanently delete local profile"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
