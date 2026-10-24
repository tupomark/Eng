"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Send, Square } from "lucide-react";
import {
  TUTOR_BLUEPRINTS,
  TUTOR_STYLES,
  TUTOR_SESSION_TYPES,
  parseTutorReply,
  type AiResult,
  type TutorMessageRequest,
  type TutorReply,
  type TutorStyle,
  type TutorSessionType,
} from "@/domain/ai/contracts";
import {
  emptyTutorWorkspace,
  permittedTutorHistory,
  type TutorConversation,
  type TutorWorkspaceState,
} from "@/domain/ai/conversation";
import { BrowserTutorRepository } from "@/infrastructure/ai/browser-conversations";
import {
  loadDictionaryVisit,
  safeDictionaryReturnHref,
  type DictionaryVisitContext,
} from "@/infrastructure/dictionary/context-navigation";
import { Shell } from "../shell";
import { Modal } from "../modal";
import styles from "./chat.module.css";

type Capability = {
  tutor: {
    configured: boolean;
    verifiedLive: boolean;
    status: string;
    provider: string | null;
    model: string | null;
  };
};
export function TutorChat({
  visitToken = "",
  returnHref = "/library",
}: {
  visitToken?: string;
  returnHref?: string;
}) {
  const [state, setState] = useState<TutorWorkspaceState>(() =>
    emptyTutorWorkspace("local", "initial"),
  );
  const current = useRef(state),
    repository = useRef<BrowserTutorRepository | null>(null);
  const profileGeneration = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [repositoryAvailable, setRepositoryAvailable] = useState(false);
  const [composer, setComposer] = useState("");
  const composerRef = useRef("");
  const [context, setContext] = useState<DictionaryVisitContext | null>(null);
  const [allowContext, setAllowContext] = useState(false),
    [allowHistory, setAllowHistory] = useState(false),
    [allowProcessing, setAllowProcessing] = useState(false);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [pending, setPending] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false);
  const [clearServerCache, setClearServerCache] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const activeRequest = useRef<{
    controller: AbortController;
    generation: string;
  } | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const session = state.sessions.find(
    (item) => item.id === state.activeSessionId,
  )!;
  const blueprint = TUTOR_BLUEPRINTS[session.sessionType];
  const sourceIds = context?.source?.documentId
    ? [context.source.documentId]
    : context
      ? [visitToken]
      : [];
  const backHref = safeDictionaryReturnHref(context?.returnHref ?? returnHref);

  const loadProfile = useCallback(async () => {
    if (locked.current || !mounted.current) return;
    const generation = ++profileGeneration.current;
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
    setPending(false);
    setReady(false);
    try {
      const response = await fetch("/api/account", {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok)
        throw new Error(
          "Your account could not be checked. Retry before opening private Tutor history.",
        );
      const account: unknown = await response.json();
      if (
        generation !== profileGeneration.current ||
        locked.current ||
        !mounted.current
      )
        return;
      if (!account || typeof account !== "object")
        throw new Error("Tutor profile could not be opened.");
      const user =
        "user" in account &&
        account.user &&
        typeof account.user === "object" &&
        "id" in account.user &&
        typeof account.user.id === "string"
          ? account.user.id
          : null;
      const scope = user ? `account:${user}` : "local";
      if (repository.current?.key === `lexis.tutor.v1:${scope}`) {
        setReady(true);
        return;
      }
      if (repository.current) {
        // A newly signed-in owner must explicitly choose their own context.
        setAllowProcessing(false);
        setAllowContext(false);
        setAllowHistory(false);
        setContext(null);
      }
      const next = new BrowserTutorRepository(
        window.localStorage,
        scope,
        crypto.randomUUID(),
      );
      repository.current = next;
      setRepositoryAvailable(true);
      const loaded = next.load();
      current.current = loaded;
      setState(loaded);
      const selected = loaded.sessions.find(
        (item) => item.id === loaded.activeSessionId,
      )!;
      composerRef.current = selected.draft;
      setComposer(selected.draft);
      setReady(true);
      setError("");
      setStatus(
        "Draft and conversation are stored in this browser profile. Cloud conversation sync is not connected.",
      );
    } catch (failure) {
      if (
        generation !== profileGeneration.current ||
        locked.current ||
        !mounted.current
      )
        return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Tutor history could not be opened. Original data is preserved.",
      );
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      await loadProfile();
      try {
        const result = await fetch("/api/ai/capabilities", {
          cache: "no-store",
        });
        if (alive && result.ok)
          setCapability((await result.json()) as Capability);
      } catch {
        if (alive)
          setStatus(
            "Capability status is unavailable. Your local draft remains usable.",
          );
      }
      if (visitToken && alive)
        try {
          const visit = loadDictionaryVisit(visitToken);
          setContext(visit);
          if (!visit)
            setError(
              "The selected passage is no longer available in this tab. You can continue without it.",
            );
        } catch {
          setError("The passage could not be read. No context will be sent.");
        }
    });
    const onFocus = () => {
      void loadProfile();
    };
    const ended = () => {
      locked.current = true;
      profileGeneration.current += 1;
      activeRequest.current?.controller.abort();
      activeRequest.current = null;
      repository.current = null;
      setRepositoryAvailable(false);
      setReady(false);
      setPending(false);
      setAllowProcessing(false);
      setAllowContext(false);
      setAllowHistory(false);
      setContext(null);
      setComposer("");
      composerRef.current = "";
      setState(emptyTutorWorkspace("local", "initial"));
      setError(
        "The account session ended. Reopen Tutor after choosing the next account; no private request remains active.",
      );
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("lexis:account-session-ended", ended);
    window.addEventListener("lexis-local-purge", ended);
    return () => {
      alive = false;
      mounted.current = false;
      profileGeneration.current += 1;
      activeRequest.current?.controller.abort();
      activeRequest.current = null;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("lexis:account-session-ended", ended);
      window.removeEventListener("lexis-local-purge", ended);
    };
  }, [loadProfile, visitToken]);

  function commit(
    update: (session: TutorConversation) => TutorConversation,
  ): boolean {
    if (!repository.current || !ready) return false;
    try {
      const next = repository.current.commit({
        ...current.current,
        sessions: current.current.sessions.map((item) =>
          item.id === current.current.activeSessionId ? update(item) : item,
        ),
      });
      current.current = next;
      setState(next);
      setError("");
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Your edit could not be saved. Keep a copy before leaving.",
      );
      return false;
    }
  }
  function editDraft(value: string) {
    setComposer(value);
    composerRef.current = value;
    if (commit((item) => ({ ...item, draft: value })))
      setStatus("Draft saved on this device.");
    else setStatus("Draft is not saved. Keep a copy before leaving.");
  }
  async function send(retry = false) {
    if (
      pending ||
      activeRequest.current ||
      !ready ||
      locked.current ||
      !allowProcessing ||
      !composerRef.current.trim()
    )
      return;
    const snapshot = current.current.sessions.find(
      (item) => item.id === current.current.activeSessionId,
    )!;
    const permittedSources = allowContext ? sourceIds : [];
    let request: TutorMessageRequest;
    if (retry && snapshot.pendingRequest) {
      request = snapshot.pendingRequest;
      if (
        (request.context &&
          (!allowContext ||
            request.context.sourceIds.some(
              (id) => !permittedSources.includes(id),
            ))) ||
        (request.history.length > 0 && !allowHistory)
      ) {
        setError(
          "This saved request used context or history whose permission is now off. Start a new request with the currently allowed scope.",
        );
        return;
      }
    } else {
      request = {
        requestId: crypto.randomUUID(),
        sessionId: snapshot.id,
        style: snapshot.style,
        sessionType: snapshot.sessionType,
        message: composerRef.current,
        history: allowHistory
          ? permittedTutorHistory(snapshot.messages, permittedSources)
          : [],
        context:
          allowContext && context
            ? {
                id: visitToken,
                excerpt: context.excerpt,
                sourceIds: permittedSources,
              }
            : null,
        consent: true,
      };
      while (
        new TextEncoder().encode(JSON.stringify(request)).byteLength > 90_000 &&
        request.history.length
      )
        request.history.shift();
    }
    const sourceLineage = Array.from(
      new Set([
        ...(request.context?.sourceIds ?? []),
        ...request.history.flatMap((item) => item.sourceIds),
      ]),
    );
    if (
      !commit((item) => ({
        ...item,
        pendingRequest: request,
        messages: item.messages.some(
          (message) => message.id === request.requestId,
        )
          ? item.messages.map((message) =>
              message.id === request.requestId
                ? { ...message, status: "pending" }
                : message,
            )
          : [
              ...item.messages,
              {
                id: request.requestId,
                requestId: request.requestId,
                role: "user",
                text: request.message,
                occurredAt: new Date().toISOString(),
                status: "pending",
                sourceIds: sourceLineage,
              },
            ],
      }))
    )
      return;
    const controller = new AbortController(),
      generation = crypto.randomUUID();
    activeRequest.current = { controller, generation };
    setPending(true);
    setStatus("Your question is saved. Waiting for a validated reply…");
    try {
      const response = await fetch("/api/tutor/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const result = (await response.json()) as AiResult<TutorReply>;
      if (
        activeRequest.current?.generation !== generation ||
        controller.signal.aborted
      )
        return;
      if (!result.ok) {
        commit((item) => ({
          ...item,
          messages: item.messages.map((message) =>
            message.id === request.requestId
              ? { ...message, status: "unavailable" }
              : message,
          ),
        }));
        setStatus(
          typeof result.message === "string"
            ? result.message
            : "No reply was confirmed. Your question is kept.",
        );
        return;
      }
      const reply = parseTutorReply(result.value, request);
      if (
        !result.provenance ||
        typeof result.provenance.provider !== "string" ||
        typeof result.provenance.model !== "string"
      )
        throw new Error(
          "The reply did not include verifiable provider provenance.",
        );
      const cleared = composerRef.current === request.message;
      if (
        commit((item) => ({
          ...item,
          ...(cleared ? { draft: "" } : {}),
          pendingRequest: undefined,
          messages: [
            ...item.messages.map((message) =>
              message.id === request.requestId
                ? { ...message, status: "answered" as const }
                : message,
            ),
            {
              id: `reply-${request.requestId}`,
              requestId: request.requestId,
              role: "assistant",
              text: reply.text,
              occurredAt: new Date().toISOString(),
              status: "answered",
              sourceIds: sourceLineage,
              provenance: result.provenance,
            },
          ],
        }))
      ) {
        if (cleared) {
          setComposer("");
          composerRef.current = "";
        }
        setStatus(
          "Reply saved locally. It is AI guidance, not a recorded skill assessment.",
        );
      }
    } catch {
      if (activeRequest.current?.generation !== generation) return;
      commit((item) => ({
        ...item,
        messages: item.messages.map((message) =>
          message.id === request.requestId
            ? {
                ...message,
                status: controller.signal.aborted ? "cancelled" : "unavailable",
              }
            : message,
        ),
      }));
      setStatus(
        controller.signal.aborted
          ? "Request cancelled. Your question and draft are kept. No learning assessment was saved."
          : "The reply could not be confirmed. Your question is kept; check the same request before starting another one.",
      );
    } finally {
      if (activeRequest.current?.generation === generation) {
        activeRequest.current = null;
        setPending(false);
      }
    }
  }
  function cancel() {
    const request = activeRequest.current;
    if (!request) return;
    request.controller.abort();
    activeRequest.current = null;
    setPending(false);
    commit((item) => ({
      ...item,
      messages: item.messages.map((message) =>
        message.status === "pending"
          ? { ...message, status: "cancelled" }
          : message,
      ),
    }));
    setStatus(
      "Request cancelled. Your question and draft are kept. No learning assessment was saved.",
    );
  }
  function exportData() {
    try {
      const url = URL.createObjectURL(
        new Blob([repository.current?.exportRaw() ?? ""], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "lexis-tutor-local.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setError(
        "Tutor data could not be exported. Original data remains on this device.",
      );
    }
  }
  function newSession() {
    if (!repository.current || pending) return;
    const nextSession = emptyTutorWorkspace(
      current.current.ownerScope,
      crypto.randomUUID(),
    ).sessions[0]!;
    try {
      const next = repository.current.commit({
        ...current.current,
        activeSessionId: nextSession.id,
        sessions: [...current.current.sessions, nextSession],
      });
      current.current = next;
      setState(next);
      setComposer("");
      composerRef.current = "";
      setShowOlder(false);
      setStatus(
        "New session started; previous conversations remain in this profile.",
      );
    } catch {
      setError(
        "A new session could not be saved. Export or remove old conversations before retrying.",
      );
    }
  }
  async function deleteConversations() {
    if (deleting || !repository.current || !ready) return;
    setDeleting(true);
    let serverCleared = false;
    try {
      if (
        clearServerCache &&
        current.current.ownerScope.startsWith("account:")
      ) {
        const response = await fetch("/api/ai/replies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmation: "CLEAR AI REPLY CACHE",
            expectedUserId: current.current.ownerScope.slice("account:".length),
          }),
          signal: AbortSignal.timeout(25_000),
        });
        const result: unknown = await response.json();
        if (
          !response.ok ||
          !result ||
          typeof result !== "object" ||
          !("ok" in result) ||
          result.ok !== true
        )
          throw new Error(
            "Server AI reply-cache deletion could not be confirmed. Local conversations were kept; retry or choose local-only deletion.",
          );
        serverCleared = true;
      }
      const next = repository.current.reset(true);
      current.current = next;
      setState(next);
      setComposer("");
      composerRef.current = "";
      setDeleteOpen(false);
      setClearServerCache(false);
      setStatus(
        serverCleared
          ? "Local Tutor conversations were deleted and server delivery replies were cleared. Cost/idempotency receipts and provider-held records are separate."
          : "Tutor conversations and drafts were deleted from this browser profile. Server AI delivery replies were not changed.",
      );
    } catch (error) {
      setError(
        serverCleared
          ? "Server delivery replies were cleared, but local deletion could not be confirmed. Original local data remains; retry local deletion."
          : error instanceof Error
            ? error.message
            : "Tutor data could not be deleted. Original data remains on this device.",
      );
    } finally {
      setDeleting(false);
    }
  }
  const visibleMessages = showOlder
    ? session.messages
    : session.messages.slice(-20);
  return (
    <Shell title="Tutor">
      <div className={styles.workspace}>
        <Link className="text-link" href={backHref}>
          <ArrowLeft size={16} /> Return to your source
        </Link>
        <header className={styles.heading}>
          <p className="eyebrow">AI TUTOR · PRIVATE CONTEXT</p>
          <h1>
            Make room
            <br />
            <span>for understanding.</span>
          </h1>
          <p className="intro-copy">
            Ask a question, choose how you want help, and decide which context
            to share.
          </p>
        </header>
        <section className={styles.capability} aria-label="Tutor capability">
          <p>
            {capability?.tutor.configured
              ? "AI is configured; live verification is pending."
              : "AI is awaiting configuration."}
          </p>
          <p className="muted">
            {capability?.tutor.configured
              ? `${capability.tutor.provider} · ${capability.tutor.model}`
              : "Your questions and session outline work locally. No prepared answer stands in for a real tutor."}{" "}
            No language assessment is recorded by this chat.
          </p>
          <Link className="text-link" href="/tutor">
            Open Voice visual preview <ArrowRight size={15} />
          </Link>
        </section>
        {error && (
          <div>
            <p className="status-banner error" role="alert">
              {error}
            </p>
            {!ready && (
              <div className={styles.actions}>
                <button
                  className="button secondary"
                  onClick={() => void loadProfile()}
                >
                  Retry opening Tutor
                </button>
                {repositoryAvailable && (
                  <button className="button ghost" onClick={exportData}>
                    Export original Tutor data
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {!ready ? (
          <p role="status">Opening your private Tutor profile…</p>
        ) : (
          <>
            <section
              className={styles.settings}
              aria-label="Tutor session settings"
            >
              <label>
                Teaching style
                <select
                  aria-label="Teaching style"
                  value={session.style}
                  disabled={pending}
                  onChange={(event) =>
                    commit((item) => ({
                      ...item,
                      style: event.target.value as TutorStyle,
                    }))
                  }
                >
                  {TUTOR_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {style[0]!.toUpperCase() + style.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Session type
                <select
                  aria-label="Session type"
                  value={session.sessionType}
                  disabled={pending}
                  onChange={(event) =>
                    commit((item) => ({
                      ...item,
                      sessionType: event.target.value as TutorSessionType,
                      phase: 0,
                    }))
                  }
                >
                  {TUTOR_SESSION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TUTOR_BLUEPRINTS[type].label}
                    </option>
                  ))}
                </select>
              </label>
            </section>
            <section className={styles.outline}>
              <h2>{blueprint.label}</h2>
              <p>{blueprint.purpose}</p>
              <ol>
                {blueprint.steps.map((step, index) => (
                  <li
                    key={step}
                    aria-current={session.phase === index ? "step" : undefined}
                  >
                    {step}
                  </li>
                ))}
              </ol>
              <button
                className="button ghost"
                disabled={session.phase >= 2}
                onClick={() =>
                  commit((item) => ({
                    ...item,
                    phase: Math.min(2, item.phase + 1),
                  }))
                }
              >
                Move to next outline step
              </button>
              <p className={styles.note}>
                You control this outline. Moving a step does not imply that a
                lesson or assessment was completed.
              </p>
            </section>
            <details className={styles.permissions} open={Boolean(context)}>
              <summary>Context &amp; processing permission</summary>
              {context ? (
                <>
                  <blockquote>{context.excerpt}</blockquote>
                  <label>
                    <input
                      type="checkbox"
                      checked={allowContext}
                      onChange={(event) => {
                        if (!event.target.checked) cancel();
                        setAllowContext(event.target.checked);
                      }}
                    />{" "}
                    Include only this selected passage with the next request
                  </label>
                </>
              ) : (
                <p>
                  No passage is attached. The tutor has no access to your books,
                  drafts or corpus.
                </p>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={allowHistory}
                  onChange={(event) => {
                    if (!event.target.checked) cancel();
                    setAllowHistory(event.target.checked);
                  }}
                />{" "}
                Include up to 12 recent permitted messages from this session
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={allowProcessing}
                  onChange={(event) => {
                    if (!event.target.checked) cancel();
                    setAllowProcessing(event.target.checked);
                  }}
                />{" "}
                Allow the configured AI provider to process my next message and
                the selected scope
              </label>
              <p className={styles.note}>
                Provider processing is separate from browser storage. The server
                requests store:false; this is not a promise about the provider’s
                legal retention terms. Raw audio and the whole corpus are never
                sent by this text workspace.
              </p>
            </details>
            <section
              className={styles.transcript}
              aria-label="Tutor conversation"
            >
              {session.messages.length > 20 && !showOlder && (
                <button
                  className="button ghost"
                  onClick={() => setShowOlder(true)}
                >
                  Show earlier messages
                </button>
              )}
              {visibleMessages.length ? (
                visibleMessages.map((message) => (
                  <article
                    className={`${styles.message} ${message.role === "assistant" ? styles.assistant : ""}`}
                    key={message.id}
                  >
                    <p className="eyebrow">
                      {message.role === "user" ? "YOUR MESSAGE" : "AI GUIDANCE"}{" "}
                      · {message.status}
                    </p>
                    <p>{message.text}</p>
                    {message.provenance && (
                      <p className={styles.note}>
                        {message.provenance.provider} ·{" "}
                        {message.provenance.model} ·{" "}
                        {message.provenance.rubricVersion}
                      </p>
                    )}
                  </article>
                ))
              ) : (
                <p className={styles.empty}>
                  Start with one question or a passage you want to understand.
                  No progress is assumed.
                </p>
              )}
            </section>
            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                void send(false);
              }}
            >
              <label htmlFor="tutor-message">Your question</label>
              <textarea
                id="tutor-message"
                maxLength={6_000}
                rows={5}
                value={composer}
                onChange={(event) => editDraft(event.target.value)}
                placeholder="What would you like to understand?"
              />
              <div className={styles.actions}>
                <button
                  className="button primary"
                  disabled={pending || !allowProcessing || !composer.trim()}
                >
                  <Send size={16} /> Send question
                </button>
                {pending && (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={cancel}
                  >
                    <Square size={15} /> Cancel request
                  </button>
                )}
                {session.pendingRequest && !pending && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!allowProcessing}
                    onClick={() => void send(true)}
                  >
                    Check the saved request again
                  </button>
                )}
              </div>
            </form>
            {status && (
              <p className={styles.status} role="status">
                {status}
              </p>
            )}
            <section className={styles.data}>
              <label>
                Saved sessions
                <select
                  aria-label="Saved sessions"
                  value={state.activeSessionId}
                  disabled={pending}
                  onChange={(event) => {
                    try {
                      const next = repository.current!.commit({
                        ...current.current,
                        activeSessionId: event.target.value,
                      });
                      current.current = next;
                      setState(next);
                      const selected = next.sessions.find(
                        (item) => item.id === next.activeSessionId,
                      )!;
                      setComposer(selected.draft);
                      composerRef.current = selected.draft;
                    } catch {
                      setError(
                        "This session could not be reopened. Current input is preserved.",
                      );
                    }
                  }}
                >
                  {state.sessions.map((item, index) => (
                    <option value={item.id} key={item.id}>
                      {index + 1}. {TUTOR_BLUEPRINTS[item.sessionType].label}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                <button
                  className="button ghost"
                  disabled={pending}
                  onClick={newSession}
                >
                  New session
                </button>
                <button className="button ghost" onClick={exportData}>
                  <Download size={15} /> Export Tutor data
                </button>
                <button
                  className="button ghost"
                  disabled={pending}
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete this profile’s Tutor data
                </button>
              </div>
              <p className={styles.note}>
                Profile:{" "}
                {state.ownerScope === "local"
                  ? "local single-device mode"
                  : "signed-in browser profile"}
                . Conversations remain separate from learning evidence and are
                not cloud-synchronized.
              </p>
            </section>
          </>
        )}
        <Modal
          open={deleteOpen}
          onClose={() => {
            if (!deleting) setDeleteOpen(false);
          }}
          title="Delete Tutor data for this profile?"
        >
          <p>
            This removes the stored conversations and drafts for the current
            browser profile. Export a copy first. It does not delete books or
            learning evidence. Server reply-cache deletion is separate from
            provider retention and backups.
          </p>
          {state.ownerScope.startsWith("account:") && (
            <label className={styles.note}>
              <input
                type="checkbox"
                checked={clearServerCache}
                disabled={deleting}
                onChange={(event) => setClearServerCache(event.target.checked)}
              />{" "}
              Also clear server AI delivery replies for this signed-in account.
              Cost and retry receipts remain.
            </label>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Keep Tutor data
            </button>
            <button
              className="button danger"
              disabled={deleting}
              onClick={() => void deleteConversations()}
            >
              {deleting
                ? "Deleting the selected Tutor data…"
                : "Delete conversations and drafts"}
            </button>
          </div>
        </Modal>
      </div>
    </Shell>
  );
}
