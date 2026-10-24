"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./account.module.css";

type FormMode = "sign-in" | "sign-up" | "recover" | "update-password";

export function AccountForm({
  configured,
  userEmail,
  recovery,
}: {
  configured: boolean;
  userEmail: string | null;
  recovery: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<FormMode>(
    recovery ? "update-password" : "sign-in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function submit(action: FormMode | "sign-out") {
    if (!configured || busy || pending.current) return;
    if (action === "sign-out")
      window.dispatchEvent(new Event("lexis:account-session-ended"));
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email, password }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("message" in result) ||
        typeof result.message !== "string"
      )
        throw new Error("Unreadable account response");
      const ok = response.ok && "ok" in result && result.ok === true;
      setFeedback({ ok, message: result.message });
      if (ok) {
        setPassword("");
        router.refresh();
      }
    } catch {
      if (!controller.signal.aborted)
        setFeedback({
          ok: false,
          message:
            "The connection was interrupted. Your input is still here; retry when ready.",
        });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (pending.current === controller) pending.current = null;
    }
  }

  const label =
    mode === "sign-in"
      ? "Sign in"
      : mode === "sign-up"
        ? "Create account"
        : mode === "recover"
          ? "Send recovery email"
          : "Save new password";

  return (
    <div className={styles.formArea}>
      {userEmail && (
        <div className={styles.session}>
          <p>
            Signed in as <strong>{userEmail}</strong>
          </p>
          <button
            className="button secondary"
            onClick={() => submit("sign-out")}
            disabled={busy}
          >
            {busy ? "Please wait…" : "Sign out of this session"}
          </button>
        </div>
      )}
      {(!userEmail || recovery) && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(mode);
          }}
        >
          {!recovery && (
            <label>
              Account action
              <select
                value={mode}
                disabled={busy || !configured}
                onChange={(event) => {
                  setMode(event.target.value as FormMode);
                  setFeedback(null);
                }}
              >
                <option value="sign-in">Sign in</option>
                <option value="sign-up">Create account</option>
                <option value="recover">Recover access</option>
              </select>
            </label>
          )}
          {mode !== "update-password" && (
            <label>
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                disabled={busy || !configured}
              />
            </label>
          )}
          {mode !== "recover" && (
            <label>
              {mode === "update-password" ? "New password" : "Password"}
              <input
                type="password"
                name="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={mode === "sign-in" ? 1 : 8}
                maxLength={256}
                disabled={busy || !configured}
              />
            </label>
          )}
          <button className="button primary" disabled={busy || !configured}>
            {busy ? "Please wait…" : label}
          </button>
        </form>
      )}
      {feedback && (
        <p className={styles.feedback} role={feedback.ok ? "status" : "alert"}>
          {feedback.message}
        </p>
      )}
    </div>
  );
}
