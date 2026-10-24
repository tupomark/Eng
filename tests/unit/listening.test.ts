import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  initialListeningSession,
  parseListeningSession,
  repeatPosition,
  setRepeatRange,
  updatePlayback,
  updateTranscriptVisibility,
} from "@/domain/listening/session";
import {
  decodeStoredMedia,
  sniffMedia,
} from "@/infrastructure/listening/media-repository";
import { sampleListeningTask } from "@/infrastructure/listening/sample-task";
import {
  beginTask,
  evaluateClosedTask,
  finishTask,
  observationFromTask,
  revealTaskHelp,
  submitTask,
} from "@/domain/tasks/engine";

const NOW = "2026-10-24T12:00:00.000Z";
describe("listening session and help provenance", () => {
  it("reads legacy Blob and portable byte records without accepting missing or mismatched content", async () => {
    const bytes = new TextEncoder().encode("bounded fixture");
    const metadata = {
      id: "media-fixture",
      owner: "local",
      title: "Fixture",
      fileName: "fixture.wav",
      mime: "audio/wav",
      kind: "audio",
      byteLength: bytes.byteLength,
      createdAt: NOW,
    };
    const legacy = decodeStoredMedia({ ...metadata, blob: new Blob([bytes]) });
    const portable = decodeStoredMedia({
      ...metadata,
      encoding: "array-buffer-v1",
      data: bytes.buffer,
    });
    expect(await legacy.blob.text()).toBe("bounded fixture");
    expect(await portable.blob.text()).toBe("bounded fixture");
    expect(portable).not.toHaveProperty("data");
    expect(() =>
      decodeStoredMedia({
        ...metadata,
        encoding: "array-buffer-v1",
        data: new ArrayBuffer(1),
      }),
    ).toThrow("unreadable");
    expect(() => decodeStoredMedia(metadata)).toThrow("unreadable");
  });
  it("rejects mismatched source IDs, invalid clocks/rates and malformed positions", () => {
    const initial = initialListeningSession("source");
    expect(() =>
      parseListeningSession({ ...initial, id: "another-session" }),
    ).toThrow("identity");
    expect(() =>
      parseListeningSession({ ...initial, position: NaN }),
    ).toThrow();
    expect(() =>
      parseListeningSession({ ...initial, playbackRate: 30 }),
    ).toThrow();
    expect(() =>
      parseListeningSession({ ...initial, duration: 4, position: 5 }),
    ).toThrow();
    expect(() =>
      updateTranscriptVisibility(initial, "full", "not-a-date"),
    ).toThrow();
  });
  it("a seek/pause is not counted as heard playback; short playing deltas are separate activity", () => {
    const initial = initialListeningSession("source");
    const seek = updatePlayback(initial, 10, 30, false);
    expect(seek.playedSeconds).toBe(0);
    const playing = updatePlayback(seek, 10.7, 30, true);
    expect(playing.playedSeconds).toBeCloseTo(0.7);
    expect(updatePlayback(playing, 25, 30, true).playedSeconds).toBeCloseTo(
      0.7,
    );
  });
  it("hiding a transcript does not erase previous assistance", () => {
    const revealed = updateTranscriptVisibility(
      initialListeningSession("source"),
      "partial",
      NOW,
    );
    const hidden = updateTranscriptVisibility(
      revealed,
      "hidden",
      "2026-10-24T12:01:00.000Z",
    );
    expect(hidden.transcriptRevealedAt).toBe(NOW);
    expect(() =>
      parseListeningSession({
        ...hidden,
        transcriptVisibility: "full",
        transcriptRevealedAt: undefined,
      }),
    ).toThrow();
  });
  it("A–B ranges stay inside the actual recording and produce a deterministic repeat address", () => {
    const initial = updatePlayback(
      initialListeningSession("source"),
      0,
      4,
      false,
    );
    expect(() => setRepeatRange(initial, 2, 1)).toThrow("B after A");
    expect(() => setRepeatRange(initial, 0, 5)).toThrow();
    const repeating = setRepeatRange(initial, 0.5, 2);
    expect(repeatPosition(updatePlayback(repeating, 2.2, 4, true))).toBe(0.5);
    expect(repeatPosition(updatePlayback(repeating, 1.8, 4, true))).toBeNull();
  });
  it("the real original sample is a playable PCM WAV, while disguised content is rejected", () => {
    const bytes = new Uint8Array(readFileSync("public/audio/lexis-coast.wav"));
    expect(sniffMedia(bytes.slice(0, 64), "sample.wav", "audio/wav")).toEqual({
      mime: "audio/wav",
      kind: "audio",
    });
    expect(bytes.length).toBeGreaterThan(100_000);
    expect(() =>
      sniffMedia(
        new TextEncoder().encode("not an audio file"),
        "fake.wav",
        "audio/wav",
      ),
    ).toThrow("not a supported");
  });
  it("real-sample comprehension records only listening and exposes transcript assistance", () => {
    const task = sampleListeningTask();
    const makeObservation = (assisted: boolean) => {
      let attempt = beginTask(task, assisted ? "assisted" : "independent", NOW);
      if (assisted)
        attempt = revealTaskHelp(task, attempt, { kind: "transcript" }, NOW);
      const submitted = submitTask(
        task,
        attempt,
        "By the sea.",
        "2026-10-24T12:01:00.000Z",
      );
      return observationFromTask(
        task,
        finishTask(task, submitted, evaluateClosedTask(task, submitted)),
      );
    };
    expect(makeObservation(false)).toMatchObject({
      skill: "listening",
      modality: "audio-output",
      independent: true,
      outcome: "accepted",
    });
    expect(makeObservation(true)).toMatchObject({
      skill: "listening",
      modality: "audio-output",
      independent: false,
      outcome: "accepted",
      assistance: { transcriptRevealedAt: NOW },
    });
    expect(task.source.provider).toContain("synthetic speech");
    expect(task.skill).not.toBe("pronunciation");
  });
});
