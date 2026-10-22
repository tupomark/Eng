import { describe, expect, it } from "vitest";
import {
  createVoicePreview,
  isVoicePreviewState,
  transitionVoicePreview,
  VOICE_PREVIEW_STATES,
} from "../../src/domain/voice-preview";

describe("user-controlled visual voice preview", () => {
  it("starts quietly with no implied audio session", () => {
    expect(createVoicePreview()).toEqual({
      state: "idle",
      resumeState: "idle",
    });
  });

  it("permits an explicit selection of every preview state", () => {
    for (const state of VOICE_PREVIEW_STATES) {
      expect(
        transitionVoicePreview(createVoicePreview(), { type: "select", state })
          .state,
      ).toBe(state);
    }
  });

  it("pauses and resumes the selected visual state without advancing a session", () => {
    const speaking = transitionVoicePreview(createVoicePreview(), {
      type: "select",
      state: "speaking",
    });
    const paused = transitionVoicePreview(speaking, { type: "pause" });
    expect(paused).toEqual({ state: "paused", resumeState: "speaking" });
    expect(transitionVoicePreview(paused, { type: "resume" })).toEqual(
      speaking,
    );
  });

  it("preserves the last selected state when paused through the selector", () => {
    const processing = transitionVoicePreview(createVoicePreview(), {
      type: "select",
      state: "processing",
    });
    const paused = transitionVoicePreview(processing, {
      type: "select",
      state: "paused",
    });
    expect(transitionVoicePreview(paused, { type: "resume" }).state).toBe(
      "processing",
    );
  });

  it("keeps repeated pause and inactive resume actions idempotent", () => {
    const initial = createVoicePreview();
    expect(transitionVoicePreview(initial, { type: "resume" })).toBe(initial);
    const paused = transitionVoicePreview(initial, { type: "pause" });
    expect(transitionVoicePreview(paused, { type: "pause" })).toBe(paused);
  });

  it("holds error until an explicit reset or new selection", () => {
    const listening = transitionVoicePreview(createVoicePreview(), {
      type: "select",
      state: "listening",
    });
    const error = transitionVoicePreview(listening, {
      type: "select",
      state: "error",
    });
    expect(transitionVoicePreview(error, { type: "pause" })).toBe(error);
    expect(transitionVoicePreview(error, { type: "resume" })).toBe(error);
    expect(transitionVoicePreview(error, { type: "reset" })).toEqual(
      createVoicePreview(),
    );
    expect(
      transitionVoicePreview(error, { type: "select", state: "speaking" })
        .state,
    ).toBe("speaking");
  });

  it("selects a new state instead of resurrecting a previously paused one", () => {
    const speaking = transitionVoicePreview(createVoicePreview(), {
      type: "select",
      state: "speaking",
    });
    const paused = transitionVoicePreview(speaking, { type: "pause" });
    const listening = transitionVoicePreview(paused, {
      type: "select",
      state: "listening",
    });
    expect(listening).toEqual({ state: "listening", resumeState: "listening" });
  });

  it("rejects unknown strings at the native select boundary", () => {
    expect(isVoicePreviewState("listening")).toBe(true);
    expect(isVoicePreviewState("recording")).toBe(false);
    expect(isVoicePreviewState("")).toBe(false);
  });
});
