"use client";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { useTaskLearning } from "@/components/task-learning-provider";
import {
  initialListeningSession,
  parseListeningSession,
  repeatPosition,
  setRepeatRange,
  updatePlayback,
  updateTranscriptVisibility,
  type ListeningSession,
  type TranscriptVisibility,
} from "@/domain/listening/session";
import {
  commitListeningSession,
  deleteLocalMedia,
  LISTENING_SAMPLE_ID,
  listLocalMedia,
  loadLocalMedia,
  loadListeningSession,
  saveLocalMedia,
  type LocalMediaAsset,
  type LocalMediaMetadata,
} from "@/infrastructure/listening/media-repository";
import {
  SAMPLE_TRANSCRIPT,
  sampleListeningTask,
} from "@/infrastructure/listening/sample-task";
import { LocalShadowing } from "./local-shadowing";
import {
  localPurgePending,
  subscribeToLocalPurge,
  subscribeToProfileRestore,
} from "@/infrastructure/materials/purge-signal";
import styles from "@/components/materials/materials.module.css";

function timestamp(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

function verifyPlayable(blob: Blob, kind: "audio" | "video"): Promise<void> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind);
    const objectUrl = URL.createObjectURL(blob);
    const finish = (message?: string) => {
      clearTimeout(timer);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(objectUrl);
      if (message) reject(new Error(message));
      else resolve();
    };
    const timer = setTimeout(
      () =>
        finish(
          "This file could not be decoded in time. Try a smaller supported recording; your library is unchanged.",
        ),
      10_000,
    );
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      if (Number.isFinite(element.duration) && element.duration > 0) finish();
      else
        finish(
          "This recording has no supported playable duration. Your library is unchanged.",
        );
    };
    element.onerror = () =>
      finish(
        "This file could not be played by this browser. Your library is unchanged.",
      );
    element.src = objectUrl;
    element.load();
  });
}

export function ListeningWorkspace({
  sourceId = LISTENING_SAMPLE_ID,
}: {
  sourceId?: string;
}) {
  const router = useRouter();
  const tasks = useTaskLearning();
  const [assets, setAssets] = useState<LocalMediaMetadata[]>([]);
  const [loadedAsset, setLoadedAsset] = useState<LocalMediaAsset | null>(null);
  const [session, setSession] = useState(() =>
    initialListeningSession(sourceId),
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [importing, setImporting] = useState(false);
  const [a, setA] = useState("0");
  const [b, setB] = useState("0");
  const [answerDraft, setAnswerDraft] = useState<{
    attemptId: string;
    value: string;
  } | null>(null);
  const media = useRef<HTMLMediaElement | null>(null);
  const current = useRef(session);
  const revision = useRef(0);
  const readable = useRef(false);
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const lastSaved = useRef(0);
  const loadedPosition = useRef(false);
  const asset = loadedAsset?.id === sourceId ? loadedAsset : null;
  const sample = sourceId === LISTENING_SAMPLE_ID;
  const sessionReady = ready && session.sourceId === sourceId;
  const hasSource = sample || !!asset;
  const task = sampleListeningTask();
  const attempt = session.taskAttemptId
    ? tasks.state.attempts.find(
        (item) =>
          item.id === session.taskAttemptId &&
          item.taskId === task.id &&
          item.taskVersion === task.version,
      )
    : undefined;
  const answer =
    answerDraft?.attemptId === attempt?.id
      ? (answerDraft?.value ?? "")
      : (attempt?.answer ?? "");

  useEffect(() => {
    let active = true;
    listLocalMedia()
      .then((items) => {
        if (active && !localPurgePending()) setAssets(items);
      })
      .catch(() => {
        if (active)
          setError(
            "Your private media list could not be opened. The original files have not been replaced; the sample can still play.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(
    () =>
      subscribeToLocalPurge(() => {
        readable.current = false;
        generation.current++;
        setRemoving(true);
        setPlaying(false);
        const element = media.current;
        element?.pause();
        element?.removeAttribute("src");
        element?.load();
        setAssets([]);
        setLoadedAsset(null);
        setSession(initialListeningSession(sourceId));
        setReady(false);
        setFile(null);
        setImporting(false);
        setRights(false);
        setAnswerDraft(null);
        setError(
          "Local media has been paused for deletion. Reopen LEXIS after removal completes.",
        );
        return queue.current.catch(() => {});
      }),
    [sourceId],
  );
  useEffect(
    () =>
      subscribeToProfileRestore(() => {
        readable.current = false;
        generation.current++;
        setRemoving(true);
        setPlaying(false);
        const element = media.current;
        element?.pause();
        element?.removeAttribute("src");
        element?.load();
        setReady(false);
        setImporting(false);
        setRights(false);
        setError(
          "Listening is paused for profile recovery. Your visible answer and transcript are kept here. Finish recovery, then reopen LEXIS.",
        );
        return queue.current.catch(() => {});
      }),
    [],
  );
  useEffect(() => {
    const token = ++generation.current;
    readable.current = false;
    loadedPosition.current = false;
    loadListeningSession(sourceId)
      .then((snapshot) => {
        if (token !== generation.current || localPurgePending()) return;
        const loaded =
          sample && !snapshot.transcript
            ? { ...snapshot, transcript: SAMPLE_TRANSCRIPT }
            : snapshot;
        current.current = loaded;
        revision.current = loaded.revision;
        readable.current = true;
        setSession(loaded);
        setA(String(loaded.repeatStart ?? 0));
        setB(String(loaded.repeatEnd ?? 0));
        setAnswerDraft(null);
        setReady(true);
        setError(null);
        const element = media.current;
        if (
          element &&
          element.readyState >= 1 &&
          Number.isFinite(element.duration)
        ) {
          element.currentTime = Math.min(loaded.position, element.duration);
          element.playbackRate = loaded.playbackRate;
          const positioned = updatePlayback(
            loaded,
            element.currentTime,
            element.duration,
            false,
          );
          current.current = positioned;
          setSession(positioned);
          loadedPosition.current = true;
        }
      })
      .catch((cause) => {
        if (token === generation.current) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Listening session could not be opened. Its original data has been preserved.",
          );
          setReady(false);
        }
      });
    return () => {
      generation.current = token + 1;
    };
  }, [sourceId, sample]);
  useEffect(() => {
    let active = true;
    if (sample) {
      queueMicrotask(() => {
        if (active) setLoadedAsset(null);
      });
      return () => {
        active = false;
      };
    }
    const token = generation.current;
    loadLocalMedia(sourceId)
      .then((loaded) => {
        if (active && token === generation.current && !localPurgePending())
          setLoadedAsset(loaded);
      })
      .catch((cause) => {
        if (active && token === generation.current && !localPurgePending())
          setError(
            cause instanceof Error
              ? cause.message
              : "Your selected media could not be opened.",
          );
      });
    return () => {
      active = false;
    };
  }, [sourceId, sample]);
  useEffect(() => {
    const element = media.current;
    if (!element || localPurgePending()) return;
    const objectUrl = sample
      ? "/audio/lexis-coast.wav"
      : asset
        ? URL.createObjectURL(asset.blob)
        : null;
    if (objectUrl) {
      element.src = objectUrl;
      element.load();
    }
    return () => {
      element.pause();
      element.removeAttribute("src");
      if (!sample && objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, sample]);

  function update(next: ListeningSession) {
    if (localPurgePending()) return;
    current.current = next;
    setSession(next);
  }
  function persist(next: ListeningSession): Promise<void> {
    const token = generation.current;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (!readable.current || token !== generation.current) return;
        try {
          const saved = await commitListeningSession(
            { ...next, revision: revision.current },
            revision.current,
          );
          if (token !== generation.current) return;
          revision.current = saved.revision;
          current.current = { ...current.current, revision: saved.revision };
          setNotice("Listening position saved on this device.");
          lastSaved.current = next.position;
        } catch (cause) {
          if (token !== generation.current || localPurgePending()) return;
          readable.current = false;
          setReady(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "Listening changes could not be saved. Your current input is kept for this visit.",
          );
        }
      });
    return queue.current;
  }
  useEffect(() => {
    const pause = () => {
      if (document.visibilityState === "hidden") {
        media.current?.pause();
        if (readable.current) void persist(current.current);
      }
    };
    document.addEventListener("visibilitychange", pause);
    const element = media.current;
    return () => {
      document.removeEventListener("visibilitychange", pause);
      element?.pause();
    };
    // Event lifetime owns current refs; no render-time timers or private background playback.
  }, []);
  function playback(event: SyntheticEvent<HTMLMediaElement>, paused = false) {
    const element = event.currentTarget;
    if (
      current.current.sourceId !== sourceId ||
      !Number.isFinite(element.duration)
    )
      return;
    const next = updatePlayback(
      current.current,
      element.currentTime,
      element.duration,
      !paused &&
        !element.paused &&
        !element.seeking &&
        !element.muted &&
        element.volume > 0,
    );
    update(next);
    const repeat = repeatPosition(next);
    if (repeat !== null && !paused) element.currentTime = repeat;
    if (paused || Math.abs(next.position - lastSaved.current) >= 2)
      void persist(next);
  }
  async function play() {
    if (!media.current || localPurgePending()) return;
    if (!media.current.paused) {
      media.current.pause();
      return;
    }
    try {
      await media.current.play();
      setError(null);
    } catch {
      setError(
        "Playback could not start. Tap Play again, check audio output or choose a supported file. Your position is kept.",
      );
    }
  }
  async function importMedia() {
    if (!file || !rights || importing || localPurgePending()) return;
    const token = generation.current;
    setImporting(true);
    setError(null);
    try {
      const probe = document.createElement(
        file.type.startsWith("video/") ? "video" : "audio",
      );
      const saved = await saveLocalMedia(
        file,
        (mime) => probe.canPlayType(mime) !== "",
        verifyPlayable,
      );
      const imported = await listLocalMedia();
      if (token !== generation.current || localPurgePending()) return;
      setAssets(imported);
      await persist(current.current);
      if (token !== generation.current || localPurgePending()) return;
      router.push(`/listening?source=${saved.id}`);
      setFile(null);
      setRights(false);
      setNotice("Media saved privately in this browser. No file was uploaded.");
    } catch (cause) {
      if (token !== generation.current || localPurgePending()) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "This media could not be imported. Your existing files remain unchanged.",
      );
    } finally {
      if (token === generation.current && !localPurgePending())
        setImporting(false);
    }
  }
  function reveal(visibility: TranscriptVisibility) {
    if (localPurgePending()) return;
    const now = new Date().toISOString();
    const next = updateTranscriptVisibility(current.current, visibility, now);
    if (
      attempt &&
      attempt.status === "answering" &&
      visibility !== "hidden" &&
      !tasks.revealHelp(attempt.id, { kind: "transcript" })
    )
      return;
    update(next);
    void persist(next);
  }
  const mediaProps = {
    controls: true,
    preload: "metadata" as const,
    "aria-label": sample
      ? "Original synthetic English sample"
      : "My private listening media",
    onPlay: (event: SyntheticEvent<HTMLMediaElement>) => {
      if (localPurgePending()) event.currentTarget.pause();
      else setPlaying(true);
    },
    onPause: (event: SyntheticEvent<HTMLMediaElement>) => {
      setPlaying(false);
      playback(event, true);
    },
    onTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => playback(event),
    onSeeked: (event: SyntheticEvent<HTMLMediaElement>) =>
      playback(event, true),
    onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => {
      const element = event.currentTarget;
      if (
        current.current.sourceId !== sourceId ||
        !Number.isFinite(element.duration)
      )
        return;
      if (!loadedPosition.current) {
        element.currentTime = Math.min(
          current.current.position,
          element.duration,
        );
        element.playbackRate = current.current.playbackRate;
        loadedPosition.current = true;
      }
      const next = updatePlayback(
        current.current,
        element.currentTime,
        element.duration,
        false,
      );
      update(next);
      void persist(next);
    },
    onEnded: () => {
      setPlaying(false);
      if (
        current.current.repeatEnabled &&
        media.current &&
        current.current.repeatStart !== null
      ) {
        media.current.currentTime = current.current.repeatStart;
        void media.current
          .play()
          .catch(() => setError("Tap Play to repeat this fragment."));
      }
    },
    onError: () => {
      setPlaying(false);
      setError(
        "This source could not be played. Check its format or reimport a local copy. Your session and learning history have not been penalized.",
      );
    },
  };

  return (
    <Shell title="Listening Studio">
      <div className={styles.header}>
        <p className="eyebrow">LISTENING STUDIO</p>
        <h1>Make room to hear.</h1>
        <p className="intro-copy">
          Listen first, reveal help when you choose, then revisit a useful
          fragment.
        </p>
      </div>
      <div className={styles.stack}>
        <section className={`glass-panel ${styles.panel}`}>
          <label className={styles.label}>
            Recording
            <select
              className={styles.select}
              aria-label="Recording"
              value={sourceId}
              disabled={removing}
              onChange={async (event) => {
                const id = event.target.value;
                media.current?.pause();
                await persist(current.current);
                router.push(`/listening?source=${id}`);
              }}
            >
              <option value={LISTENING_SAMPLE_ID}>
                A quiet coast · original synthetic sample
              </option>
              {assets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <h2>
            {sample
              ? "A quiet coast"
              : (asset?.title ?? "Local source unavailable")}
          </h2>
          <p className={styles.small}>
            {sample
              ? "Original LEXIS text, locally generated Flite synthetic speech. No live TTS service or pronunciation scorer. Attribution available below."
              : "Your media stays in private browser storage. No transcript, voice analysis or cloud upload is automatic."}
          </p>
          {hasSource && !removing ? (
            asset?.kind === "video" ? (
              <video
                ref={(element) => {
                  media.current = element;
                }}
                {...mediaProps}
                style={{ width: "100%", maxHeight: "50dvh" }}
              />
            ) : (
              <audio
                ref={(element) => {
                  media.current = element;
                }}
                {...mediaProps}
                style={{ width: "100%" }}
              />
            )
          ) : (
            <p>
              This local file is unavailable. Choose the sample or reimport your
              permitted copy.
            </p>
          )}
          <div className={styles.actions}>
            <button
              className="button primary"
              disabled={!hasSource || removing}
              onClick={play}
            >
              {playing ? "Pause recording" : "Play recording"}
            </button>
            <button
              className="button secondary"
              disabled={!hasSource || removing}
              onClick={() => {
                if (media.current) {
                  media.current.currentTime = current.current.repeatStart ?? 0;
                  void media.current
                    .play()
                    .catch(() => setError("Tap Play to replay this fragment."));
                }
              }}
            >
              Replay fragment
            </button>
            <label className={styles.label}>
              Speed
              <select
                className={styles.select}
                aria-label="Playback speed"
                disabled={removing}
                value={session.playbackRate}
                onChange={(event) => {
                  const rate = Number(event.target.value);
                  if (media.current) media.current.playbackRate = rate;
                  const next = parseListeningSession({
                    ...current.current,
                    playbackRate: rate,
                  });
                  update(next);
                  void persist(next);
                }}
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}×
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={styles.small}>
            Position {timestamp(session.position)} /{" "}
            {timestamp(session.duration)} · {playing ? "Playing" : "Paused"}
            {!ready ? " · Position storage unavailable / opening" : ""}
          </p>
          <details>
            <summary>A–B repeat</summary>
            <div className={styles.stack}>
              <div className={styles.row}>
                <label className={styles.label}>
                  A (seconds)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={0.1}
                    value={a}
                    onChange={(event) => setA(event.target.value)}
                  />
                </label>
                <button
                  className="button ghost"
                  onClick={() =>
                    setA((media.current?.currentTime ?? 0).toFixed(1))
                  }
                >
                  Set A here
                </button>
                <label className={styles.label}>
                  B (seconds)
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    step={0.1}
                    value={b}
                    onChange={(event) => setB(event.target.value)}
                  />
                </label>
                <button
                  className="button ghost"
                  onClick={() =>
                    setB((media.current?.currentTime ?? 0).toFixed(1))
                  }
                >
                  Set B here
                </button>
              </div>
              <div className={styles.actions}>
                <button
                  className="button secondary"
                  onClick={() => {
                    try {
                      const next = setRepeatRange(
                        current.current,
                        Number(a),
                        Number(b),
                      );
                      update(next);
                      void persist(next);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Choose a valid range inside this recording.",
                      );
                    }
                  }}
                >
                  Enable A–B repeat
                </button>
                <button
                  className="button ghost"
                  onClick={() => {
                    const next = { ...current.current, repeatEnabled: false };
                    update(next);
                    void persist(next);
                  }}
                >
                  Stop repeat
                </button>
              </div>
              <p className={styles.small}>
                {session.repeatEnabled
                  ? `Repeating ${timestamp(session.repeatStart!)}–${timestamp(session.repeatEnd!)}`
                  : "Repeat is off."}
              </p>
            </div>
          </details>
          {(error || tasks.error) && (
            <p role="alert" aria-label="Listening error">
              {error || tasks.error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {sample && (
            <a className="text-link" href="/audio/ATTRIBUTION.md">
              Sample provenance and rights
            </a>
          )}
        </section>
        <section className={`glass-panel ${styles.panel}`}>
          <h2>Transcript, on your terms.</h2>
          <div className={styles.actions}>
            {(["hidden", "partial", "full"] as const).map((visibility) => (
              <button
                key={visibility}
                className={`button ${session.transcriptVisibility === visibility ? "primary" : "secondary"}`}
                aria-pressed={session.transcriptVisibility === visibility}
                disabled={!sessionReady || !session.transcript}
                onClick={() => reveal(visibility)}
              >
                {visibility === "hidden"
                  ? "Hide transcript"
                  : visibility === "partial"
                    ? "Reveal first part"
                    : "Reveal full transcript"}
              </button>
            ))}
          </div>
          {session.transcriptVisibility === "hidden" ? (
            <p className={styles.small}>
              Transcript hidden. Revealing any part records assistance for this
              listening session; hiding it again does not erase that fact.
            </p>
          ) : (
            <blockquote>
              {session.transcriptVisibility === "partial"
                ? session.transcript.split(/(?<=[.!?])\s/u)[0].slice(0, 300)
                : session.transcript}
            </blockquote>
          )}
          {!sample && (
            <label className={styles.label}>
              Your permitted transcript (manual; not automatically generated)
              <textarea
                className={styles.textarea}
                maxLength={50_000}
                value={session.transcript}
                onChange={(event) => {
                  const next = updateTranscriptVisibility(
                    { ...current.current, transcript: event.target.value },
                    "full",
                    new Date().toISOString(),
                  );
                  update(next);
                }}
                onBlur={() => void persist(current.current)}
              />
            </label>
          )}
          <p className={styles.small}>
            {session.transcriptRevealedAt
              ? "This session includes transcript assistance. It is not counted as fully independent listening."
              : "No transcript assistance recorded in this session."}
          </p>
        </section>
        {sample && (
          <section
            className={`glass-panel ${styles.panel}`}
            aria-label="Listening comprehension"
          >
            <h2>A small listening check.</h2>
            <p className={styles.small}>
              Play the real sample before starting. This checks the action
              meaning heard in the first sentence. Repeat material is not a new
              independent context.
            </p>
            {tasks.state.challenges.some(
              (entry) =>
                entry.initiator === "assessment-policy" &&
                entry.policyId === "listening-location-target-mismatch-v1",
            ) && (
              <p className={styles.small}>
                An earlier location question was withdrawn because it did not
                measure the intended word meaning. Your original answer is
                preserved and no longer influences learning or its schedule.
              </p>
            )}
            {!attempt || attempt.status !== "answering" ? (
              <button
                className="button secondary"
                disabled={
                  !sessionReady || !tasks.ready || session.playedSeconds < 0.5
                }
                onClick={() => {
                  const started = tasks.startTask(task);
                  if (!started) return;
                  if (
                    current.current.transcriptRevealedAt &&
                    !tasks.revealHelp(started.id, { kind: "transcript" })
                  )
                    return;
                  const next = {
                    ...current.current,
                    taskAttemptId: started.id,
                  };
                  update(next);
                  void persist(next);
                  setAnswerDraft(null);
                }}
              >
                Start listening check
              </button>
            ) : (
              <>
                <fieldset className={styles.stack}>
                  <legend>{task.prompt}</legend>
                  {[
                    "staying for a while",
                    "leaving immediately",
                    "running quickly",
                  ].map((choice) => (
                    <label className={styles.check} key={choice}>
                      <input
                        type="radio"
                        name={`listening-answer-${attempt.id}`}
                        value={choice}
                        checked={answer === choice}
                        onChange={() => {
                          setAnswerDraft({
                            attemptId: attempt.id,
                            value: choice,
                          });
                          tasks.saveAnswer(attempt.id, choice);
                        }}
                      />
                      {choice}
                    </label>
                  ))}
                </fieldset>
                <button
                  className="button primary"
                  disabled={!answer.trim()}
                  onClick={() => tasks.submitTask(attempt.id, answer)}
                >
                  Check listening answer
                </button>
              </>
            )}
            {attempt?.evaluation && (
              <div role="status">
                <p>
                  {attempt.evaluation.outcome === "accepted"
                    ? "Your answer fits this recording."
                    : attempt.evaluation.outcome === "partial"
                      ? "Part of the action is clear; revisit the detail."
                      : attempt.evaluation.outcome === "uncertain"
                        ? "This answer is unassessed."
                        : "Revisit the action in the recording, then try again."}
                </p>
                <p>{attempt.evaluation.explanation}</p>
                <p className={styles.small}>
                  {attempt.assistance.transcriptRevealedAt
                    ? "Assisted: transcript was available."
                    : "Transcript was hidden for this attempt."}
                </p>
                <Link className="text-link" href="/core">
                  Open evidence &amp; Challenge
                </Link>
              </div>
            )}
          </section>
        )}
        <LocalShadowing
          key={sourceId}
          beforeRecord={() => media.current?.pause()}
        />
        <section className={`glass-panel ${styles.panel}`}>
          <h2>Your permitted audio or video.</h2>
          <p className={styles.small}>
            Up to 25 MB per file, 10 files on this device. WAV, MP3, Ogg,
            M4A/MP4 and WebM depend on browser codec support. Private files are
            not cached at public URLs or sent to ASR/AI. Browser storage can be
            evicted; keep the original file.
          </p>
          <label className={styles.label}>
            Choose audio or video
            <input
              className={styles.file}
              type="file"
              accept="audio/*,video/mp4,video/webm"
              disabled={importing || removing}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setRights(false);
              }}
            />
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={rights}
              disabled={removing}
              onChange={(event) => setRights(event.target.checked)}
            />
            I am allowed to use this file and want to store it privately on this
            device.
          </label>
          <button
            className="button secondary"
            disabled={!file || !rights || importing || removing}
            onClick={importMedia}
          >
            {importing ? "Saving locally…" : "Save media on this device"}
          </button>
          {!sample && asset && (
            <button
              className="button ghost"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete “${asset.title}”, its media file, transcript and playback session from this device? Separate learning evidence is kept in Core.`,
                  )
                )
                  return;
                try {
                  readable.current = false;
                  generation.current++;
                  media.current?.pause();
                  await queue.current.catch(() => {});
                  await deleteLocalMedia(sourceId);
                  setAssets(await listLocalMedia());
                  router.push("/listening");
                } catch {
                  setError(
                    "The media could not be deleted. Your current data remains available.",
                  );
                }
              }}
            >
              Delete this media &amp; transcript
            </button>
          )}
        </section>
      </div>
    </Shell>
  );
}
