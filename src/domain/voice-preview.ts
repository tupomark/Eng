/** Visual preview only: no audio session, timers or learning evidence. */
export const VOICE_PREVIEW_STATES = [
  "idle",
  "listening",
  "processing",
  "speaking",
  "paused",
  "error",
] as const;
export type VoicePreviewState = (typeof VOICE_PREVIEW_STATES)[number];
type ResumableVoicePreviewState = Exclude<
  VoicePreviewState,
  "paused" | "error"
>;

export interface VoicePreviewModel {
  state: VoicePreviewState;
  resumeState: ResumableVoicePreviewState;
}

export type VoicePreviewAction =
  | { type: "select"; state: VoicePreviewState }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" };

export function createVoicePreview(): VoicePreviewModel {
  return { state: "idle", resumeState: "idle" };
}

export function isVoicePreviewState(value: string): value is VoicePreviewState {
  return VOICE_PREVIEW_STATES.some((state) => state === value);
}

export function transitionVoicePreview(
  model: VoicePreviewModel,
  action: VoicePreviewAction,
): VoicePreviewModel {
  switch (action.type) {
    case "select":
      if (action.state === "error")
        return { state: "error", resumeState: "idle" };
      if (action.state === "paused") return { ...model, state: "paused" };
      return { state: action.state, resumeState: action.state };
    case "pause":
      if (model.state === "paused" || model.state === "error") return model;
      return { state: "paused", resumeState: model.state };
    case "resume":
      if (model.state !== "paused") return model;
      return { ...model, state: model.resumeState };
    case "reset":
      return createVoicePreview();
  }
}
