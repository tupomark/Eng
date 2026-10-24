"use client";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/materials/materials.module.css";
import {
  localPurgePending,
  subscribeToLocalPurge,
} from "@/infrastructure/materials/purge-signal";

/** A visit-local self-listening recorder. No transcription or pronunciation grade. */
export function LocalShadowing({ beforeRecord }: { beforeRecord: () => void }) {
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<
    "idle" | "permission" | "recording" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = useRef<string | null>(null);
  const mounted = useRef(true);
  function stopTracks() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }
  function cancel() {
    generation.current++;
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
    recorder.current = null;
    stopTracks();
    if (mounted.current) setState(recordingUrl ? "ready" : "idle");
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    window.addEventListener("pagehide", cancel);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    const unsubscribePurge = subscribeToLocalPurge(() => {
      cancel();
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
      setRecordingUrl(null);
      setConsent(false);
    });
    return () => {
      mounted.current = false;
      cancel();
      if (url.current) URL.revokeObjectURL(url.current);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hide);
      unsubscribePurge();
    };
    // Capture cleanup owns its resources for the complete mounted visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function record() {
    if (
      !consent ||
      state === "recording" ||
      state === "permission" ||
      localPurgePending()
    )
      return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "This browser cannot record here. You can still listen and shadow aloud without recording.",
      );
      setState("error");
      return;
    }
    beforeRecord();
    const token = ++generation.current;
    setError(null);
    setState("permission");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || token !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (candidate) => MediaRecorder.isTypeSupported(candidate),
      );
      const current = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = current;
      const chunks: Blob[] = [];
      let size = 0;
      current.ondataavailable = (event) => {
        if (token !== generation.current || !event.data.size) return;
        size += event.data.size;
        if (size > 5 * 1024 * 1024) {
          cancel();
          setError(
            "This repeat reached the local recording size limit and was discarded. Try a shorter fragment.",
          );
          setState("error");
          return;
        }
        chunks.push(event.data);
      };
      current.onerror = () => {
        if (token !== generation.current) return;
        cancel();
        if (mounted.current) {
          setError(
            "Recording was interrupted. The microphone has stopped; you can retry.",
          );
          setState("error");
        }
      };
      current.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        if (stream.current === media) stopTracks();
        if (!mounted.current || token !== generation.current) return;
        if (!chunks.length) {
          setError(
            "No recording was captured. Nothing has been assessed or saved.",
          );
          setState("error");
          return;
        }
        const blob = new Blob(chunks, { type: current.mimeType });
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob);
        setRecordingUrl(url.current);
        setState("ready");
        recorder.current = null;
      };
      current.start(500);
      setState("recording");
      timeout.current = setTimeout(() => {
        if (token !== generation.current || recorder.current !== current)
          return;
        if (current.state !== "inactive") current.stop();
        stopTracks();
      }, 30_000);
    } catch (cause) {
      if (!mounted.current || token !== generation.current) return;
      stopTracks();
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was declined. Allow it in browser settings only if you want to record; ordinary listening remains available."
          : "A microphone could not be opened. Check your device and retry. Nothing has been assessed.",
      );
      setState("error");
    }
  }
  return (
    <section className={`glass-panel ${styles.panel}`} aria-label="Shadowing">
      <h2>Listen. Repeat. Notice.</h2>
      <p className={styles.small}>
        Choose a short A–B fragment, listen, pause, then repeat aloud. Optional
        recording stays in memory for this visit and is never sent to a service.
        There is no automatic pronunciation score.
      </p>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={consent}
          disabled={state === "recording" || state === "permission"}
          onChange={(event) => setConsent(event.target.checked)}
        />
        Allow microphone capture for my own playback on this device, up to 30
        seconds.
      </label>
      <div className={styles.actions}>
        <button
          className="button secondary"
          disabled={!consent || state === "recording" || state === "permission"}
          onClick={record}
        >
          Record my repeat
        </button>
        {state === "recording" && (
          <button
            className="button primary"
            onClick={() => {
              if (recorder.current?.state !== "inactive")
                recorder.current?.stop();
              stopTracks();
            }}
          >
            Stop recording
          </button>
        )}
        {(state === "permission" || state === "recording") && (
          <button className="button ghost" onClick={cancel}>
            Cancel recording
          </button>
        )}
        {recordingUrl && (
          <button
            className="button ghost"
            onClick={() => {
              cancel();
              if (url.current) URL.revokeObjectURL(url.current);
              url.current = null;
              setRecordingUrl(null);
              setState("idle");
            }}
          >
            Delete my recording
          </button>
        )}
      </div>
      <p role="status">
        {state === "permission"
          ? "Waiting for microphone permission. Cancel stops any late permission result."
          : state === "recording"
            ? "Recording your repeat. Stop, cancel or leave to release the microphone."
            : state === "ready"
              ? "Microphone stopped. Your repeat is ready for private playback."
              : "Microphone is off."}
      </p>
      {recordingUrl && (
        <audio
          controls
          src={recordingUrl}
          aria-label="My shadowing recording"
        />
      )}
      {error && (
        <p role="alert" aria-label="Shadowing error">
          {error}
        </p>
      )}
    </section>
  );
}
