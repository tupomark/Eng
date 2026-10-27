import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initialListeningSession,
  MEDIA_LIMITS,
  updateTranscriptVisibility,
} from "@/domain/listening/session";
import {
  canonicalMediaSession,
  createMediaBackupSnapshot,
  mediaBackupAssetFingerprint,
  mediaBackupSessionFingerprint,
  parseMediaBackupAsset,
  parseMediaBackupSnapshot,
  previewMediaBackupRestore,
  sha256MediaBytes,
  verifyMediaBackupSnapshot,
  type MediaBackupAssetMetadata,
} from "@/infrastructure/profile/media-backup";
import {
  readMediaBackupAsset,
  readMediaBackupSession,
  readMediaBackupSnapshot,
  restoreMediaBackupAsset,
  restoreMediaBackupSession,
} from "@/infrastructure/listening/media-repository";
import {
  PROFILE_EPOCH_KEY,
  PROFILE_RESTORE_KEY,
} from "@/infrastructure/profile/operation";

const now = "2026-10-26T12:00:00.000Z";
const digest = "a".repeat(64);
function asset(id = "legacy-recording"): MediaBackupAssetMetadata {
  return {
    id,
    owner: "local",
    title: "Independent listening 🌒",
    fileName: "original.wav",
    mime: "audio/wav",
    kind: "audio",
    byteLength: 12,
    createdAt: now,
    sha256: digest,
  };
}
function runningMarker(
  kind: "media-asset" | "media-session",
  target: string,
  afterHash: string,
) {
  return {
    version: 1,
    id: "restore-media-fixture",
    owner: "local",
    fileHash: digest,
    epoch: "new-profile-epoch",
    status: "running",
    startedAt: now,
    updatedAt: now,
    steps: [{ id: "media-step", kind, target, beforeHash: null, afterHash }],
    completed: [],
  };
}
function storage(values: Record<string, string>) {
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => values[key] ?? null },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("local media profile backup", () => {
  it("uses deterministic metadata and session fingerprints without exposing their text in receipts", async () => {
    const first = asset("z-source");
    const second = asset("a-source");
    const session = updateTranscriptVisibility(
      initialListeningSession(first.id),
      "full",
      now,
    );
    session.transcript = "Приватный собственный transcript with IPA /ˈwɜːd/.";
    session.revision = 9;
    session.taskAttemptId = "legacy-attempt-not-a-uuid";
    const before = structuredClone(session);
    const a = await createMediaBackupSnapshot([first, second], [session]);
    const b = await createMediaBackupSnapshot([second, first], [session]);
    expect(a).toEqual(b);
    expect(a.assets.map((item) => item.id)).toEqual(["a-source", "z-source"]);
    expect(a.signature).toMatch(/^[a-f0-9]{64}$/u);
    expect(a.sessions[0]).toEqual(before);
    expect(session).toEqual(before);
    expect(await mediaBackupSessionFingerprint(session)).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    const reordered = Object.fromEntries(Object.entries(session).reverse());
    expect(
      await mediaBackupSessionFingerprint(canonicalMediaSession(reordered)),
    ).toBe(await mediaBackupSessionFingerprint(session));
    expect(await mediaBackupAssetFingerprint(first)).not.toBe(
      await mediaBackupAssetFingerprint({ ...first, title: "Renamed" }),
    );
  });

  it("retains a content-addressed media identity and refuses its different binary digest", () => {
    const metadata = asset(`media-${digest}`);
    expect(parseMediaBackupAsset(metadata)).toEqual(metadata);
    expect(() =>
      parseMediaBackupAsset({ ...metadata, sha256: "b".repeat(64) }),
    ).toThrow("unreadable");
  });

  it("does not infer a license, consent, verified pronunciation or future metadata", async () => {
    for (const injected of [
      { ...asset(), license: "invented-rights" },
      { ...asset(), owner: "other-account" },
      { ...asset(), byteLength: MEDIA_LIMITS.maxFileBytes + 1 },
      { ...asset(), mime: "text/html" },
      { ...asset(), createdAt: "not-a-clock" },
      { ...asset(), sha256: digest.toUpperCase() },
    ])
      expect(() => parseMediaBackupAsset(injected)).toThrow();
    expect(() =>
      canonicalMediaSession({
        ...initialListeningSession("legacy-recording"),
        pronunciationScore: 99,
      }),
    ).toThrow();
    const snapshot = await createMediaBackupSnapshot([asset()], []);
    expect(() =>
      parseMediaBackupSnapshot({ ...snapshot, consent: true }),
    ).toThrow();
    expect(snapshot.assets[0]).not.toHaveProperty("license");
  });

  it("verifies the complete canonical metadata fingerprint rather than trusting valid-looking JSON", async () => {
    const snapshot = await createMediaBackupSnapshot(
      [asset()],
      [initialListeningSession("legacy-recording")],
    );
    expect(await verifyMediaBackupSnapshot(snapshot)).toEqual(snapshot);
    const altered = {
      ...snapshot,
      sessions: [{ ...snapshot.sessions[0], position: 3 }],
    };
    await expect(verifyMediaBackupSnapshot(altered)).rejects.toThrow(
      "fingerprint",
    );
    await expect(
      verifyMediaBackupSnapshot({ ...snapshot, signature: "0".repeat(64) }),
    ).rejects.toThrow("fingerprint");
    expect(snapshot.sessions[0].position).toBe(0);
  });

  it("adds new media and exact session history without regenerating original IDs or revisions", async () => {
    const current = await createMediaBackupSnapshot([], []);
    const session = {
      ...initialListeningSession("legacy-recording"),
      revision: 14,
      position: 7,
      duration: 30,
      playedSeconds: 21,
      taskAttemptId: "attempt-original",
    };
    const incoming = await createMediaBackupSnapshot([asset()], [session]);
    const preview = previewMediaBackupRestore(current, incoming);
    expect(preview.assetsToAdd).toEqual([asset()]);
    expect(preview.sessionsToAdd).toEqual([session]);
    expect(preview.conflicts).toEqual([]);
    expect(preview.warnings).toEqual([]);
    const retried = previewMediaBackupRestore(incoming, incoming);
    expect(retried.assetsToAdd).toEqual([]);
    expect(retried.sessionsToAdd).toEqual([]);
    expect(retried.unchangedAssets).toBe(1);
    expect(retried.unchangedSessions).toBe(1);
  });

  it("treats changed original metadata and session revisions as conflicts rather than last-write-wins", async () => {
    const session = initialListeningSession("legacy-recording");
    const current = await createMediaBackupSnapshot([asset()], [session]);
    const incoming = await createMediaBackupSnapshot(
      [{ ...asset(), title: "Different original title" }],
      [{ ...session, position: 4, revision: 2, transcript: "Other words" }],
    );
    const preview = previewMediaBackupRestore(current, incoming);
    expect(preview.conflicts.map((item) => item.kind)).toEqual([
      "asset",
      "session",
    ]);
    expect(preview.assetsToAdd).toEqual([]);
    expect(preview.sessionsToAdd).toEqual([]);
    expect(current.assets[0].title).toBe(asset().title);
    expect(current.sessions[0]).toEqual(session);
  });

  it("keeps a missing recording's listening history visible with an explicit source warning", async () => {
    const empty = await createMediaBackupSnapshot([], []);
    const orphan = {
      ...initialListeningSession("removed-source"),
      transcript: "Keep my original transcript",
      revision: 8,
    };
    const incoming = await createMediaBackupSnapshot(
      [],
      [orphan, initialListeningSession("lexis-original-coast-v1")],
    );
    const preview = previewMediaBackupRestore(empty, incoming);
    expect(preview.sessionsToAdd).toContainEqual(orphan);
    expect(preview.warnings).toEqual([
      { sourceId: "removed-source", reason: "source-unavailable" },
    ]);
    expect(preview.conflicts).toEqual([]);
  });

  it("does not erase existing recordings or transcripts because a backup omits them", async () => {
    const current = await createMediaBackupSnapshot(
      [asset()],
      [initialListeningSession("legacy-recording")],
    );
    const absent = await createMediaBackupSnapshot([], []);
    expect(previewMediaBackupRestore(current, absent)).toEqual({
      assetsToAdd: [],
      sessionsToAdd: [],
      unchangedAssets: 0,
      unchangedSessions: 0,
      conflicts: [],
      warnings: [],
    });
    expect(current.assets).toHaveLength(1);
    expect(current.sessions).toHaveLength(1);
  });

  it("bounds combined capacity, duplicates, unsafe transcript disclosures and malformed sessions", async () => {
    await expect(
      createMediaBackupSnapshot([asset(), asset()], []),
    ).rejects.toThrow();
    await expect(
      createMediaBackupSnapshot(
        [],
        [initialListeningSession("one"), initialListeningSession("one")],
      ),
    ).rejects.toThrow();
    await expect(
      createMediaBackupSnapshot(
        [],
        Array.from({ length: 101 }, (_, index) =>
          initialListeningSession(`source-${index}`),
        ),
      ),
    ).rejects.toThrow();
    const current = await createMediaBackupSnapshot(
      Array.from({ length: 10 }, (_, index) => asset(`source-${index}`)),
      [],
    );
    const incoming = await createMediaBackupSnapshot([asset("new-source")], []);
    expect(
      previewMediaBackupRestore(current, incoming).conflicts,
    ).toContainEqual(expect.objectContaining({ id: "media-capacity" }));
    for (const session of [
      { ...initialListeningSession("source"), transcriptVisibility: "full" },
      { ...initialListeningSession("source"), transcript: "x".repeat(50_001) },
      { ...initialListeningSession("source"), id: "foreign-session" },
      { ...initialListeningSession("source"), revision: -1 },
    ])
      expect(() => canonicalMediaSession(session)).toThrow();
  });

  it("cancels snapshot, individual file and session reads before touching IndexedDB", async () => {
    const indexedDB = {
      open: vi.fn(() => {
        throw new Error("must not open");
      }),
    };
    vi.stubGlobal("indexedDB", indexedDB);
    const controller = new AbortController();
    controller.abort();
    await expect(
      readMediaBackupSnapshot({ signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    await expect(
      readMediaBackupAsset("one", undefined, { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    await expect(
      readMediaBackupSession("one", { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(indexedDB.open).not.toHaveBeenCalled();
  });

  it("requires the exact running operation and target scope before any restore storage access", async () => {
    const indexedDB = {
      open: vi.fn(() => {
        throw new Error("must not open");
      }),
    };
    vi.stubGlobal("indexedDB", indexedDB);
    const session = initialListeningSession("legacy-recording");
    const hash = await mediaBackupSessionFingerprint(session);
    for (const marker of [
      null,
      {
        ...runningMarker("media-session", session.sourceId, hash),
        status: "staged",
      },
      runningMarker("media-session", "other-source", hash),
    ]) {
      storage({
        [PROFILE_EPOCH_KEY]: "new-profile-epoch",
        ...(marker ? { [PROFILE_RESTORE_KEY]: JSON.stringify(marker) } : {}),
      });
      await expect(
        restoreMediaBackupSession(session, null, "restore-media-fixture"),
      ).rejects.toThrow();
    }
    const marker = runningMarker("media-session", session.sourceId, hash);
    storage({
      [PROFILE_EPOCH_KEY]: "other-epoch",
      [PROFILE_RESTORE_KEY]: JSON.stringify(marker),
    });
    await expect(
      restoreMediaBackupSession(session, null, marker.id),
    ).rejects.toThrow("no longer authorized");
    storage({
      [PROFILE_EPOCH_KEY]: marker.epoch,
      [PROFILE_RESTORE_KEY]: JSON.stringify(marker),
      "lexis.local-purge.v1": "pending",
    });
    await expect(
      restoreMediaBackupSession(session, null, marker.id),
    ).rejects.toThrow("deletion");
    expect(indexedDB.open).not.toHaveBeenCalled();
  });

  it("rejects altered bytes and mislabeled media before creating or changing a media database", async () => {
    const bytes = new TextEncoder().encode("RIFF1234WAVE");
    const hash = await sha256MediaBytes(bytes.buffer);
    const metadata = { ...asset(), sha256: hash };
    const marker = runningMarker(
      "media-asset",
      metadata.id,
      await mediaBackupAssetFingerprint(metadata),
    );
    storage({
      [PROFILE_EPOCH_KEY]: marker.epoch,
      [PROFILE_RESTORE_KEY]: JSON.stringify(marker),
    });
    const indexedDB = {
      open: vi.fn(() => {
        throw new Error("must not open");
      }),
    };
    vi.stubGlobal("indexedDB", indexedDB);
    await expect(
      restoreMediaBackupAsset(metadata, new Blob(["bad"]), null, marker.id),
    ).rejects.toThrow("byte length");
    await expect(
      restoreMediaBackupAsset(
        metadata,
        new Blob(["bad-12-bytes"]),
        null,
        marker.id,
      ),
    ).rejects.toThrow("fingerprint");
    const mislabeled = { ...metadata, mime: "audio/mpeg" };
    const mismatchedMarker = runningMarker(
      "media-asset",
      metadata.id,
      await mediaBackupAssetFingerprint(mislabeled),
    );
    storage({
      [PROFILE_EPOCH_KEY]: marker.epoch,
      [PROFILE_RESTORE_KEY]: JSON.stringify(mismatchedMarker),
    });
    await expect(
      restoreMediaBackupAsset(mislabeled, new Blob([bytes]), null, marker.id),
    ).rejects.toThrow("actual format");
    expect(indexedDB.open).not.toHaveBeenCalled();
  });
});
