"use client";

import Link from "next/link";
import { useId, useReducer } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  createVoicePreview,
  isVoicePreviewState,
  transitionVoicePreview,
  VOICE_PREVIEW_STATES,
  type VoicePreviewState,
} from "@/domain/voice-preview";
import { Orb } from "./orb";

const stateDetails: Record<VoicePreviewState, string> = {
  idle: "A quiet resting state.",
  listening: "A soft outward response.",
  processing: "A focused inward motion.",
  speaking: "A gentle, measured response.",
  paused: "Movement is paused.",
  error: "An example of an unavailable connection.",
};

export function Voice() {
  const [preview, dispatch] = useReducer(
    transitionVoicePreview,
    undefined,
    createVoicePreview,
  );
  const selectId = useId();
  const disclosureId = useId();
  const paused = preview.state === "paused";
  const error = preview.state === "error";

  return (
    <main className="voice-workspace">
      <header className="voice-header">
        <Link href="/" className="text-link">
          <ArrowLeft size={17} aria-hidden="true" />
          Back to your space
        </Link>
        <span className="voice-brand">
          LEXIS <span>/ VOICE</span>
        </span>
        <span className="pill">Visual prototype</span>
      </header>
      <div className="voice-content">
        <p className="eyebrow">A LITTLE ROOM TO SPEAK</p>
        <h1>Voice Assistant</h1>
        <p className="voice-description">A softer space to find the words.</p>
        <p>
          <Link className="text-link" href="/tutor/chat">
            Open text Tutor
          </Link>{" "}
          ·{" "}
          <Link className="text-link" href="/listening">
            Listening & local shadowing
          </Link>
        </p>
        <div className="voice-stage">
          <Orb variant="voice" state={preview.state} />
        </div>
        <p
          className="voice-state"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          Preview: {preview.state}
        </p>
        <p className="voice-state-detail">{stateDetails[preview.state]}</p>
        <div className="voice-preview-controls">
          <p className="voice-preview-label">State preview · no recording</p>
          <label htmlFor={selectId} className="voice-preview-select-label">
            Preview voice state
          </label>
          <div className="voice-preview-row">
            <select
              id={selectId}
              className="voice-preview-select"
              value={preview.state}
              aria-describedby={disclosureId}
              onChange={(event) => {
                const state = event.target.value;
                if (isVoicePreviewState(state))
                  dispatch({ type: "select", state });
              }}
            >
              {VOICE_PREVIEW_STATES.map((state) => (
                <option key={state} value={state}>
                  {state.charAt(0).toUpperCase() + state.slice(1)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button voice-button"
              aria-pressed={error ? undefined : paused}
              onClick={() =>
                dispatch({
                  type: error ? "reset" : paused ? "resume" : "pause",
                })
              }
            >
              {error ? (
                <RotateCcw size={16} aria-hidden="true" />
              ) : paused ? (
                <Play size={16} aria-hidden="true" />
              ) : (
                <Pause size={16} aria-hidden="true" />
              )}
              {error
                ? "Reset preview"
                : paused
                  ? "Resume preview"
                  : "Pause preview"}
            </button>
          </div>
        </div>
        <p id={disclosureId} className="voice-disclosure">
          <Mic size={14} aria-hidden="true" />
          This visual prototype does not record, listen, speak or assess speech.
        </p>
      </div>
      <footer className="voice-footer">
        <span>AT YOUR OWN PACE.</span>
        <Link href="/reader" className="text-link">
          Begin with a reading
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </footer>
    </main>
  );
}
