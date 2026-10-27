import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyState, saveSense } from "@/domain";
import {
  emptyTutorWorkspace,
  type TutorWorkspaceState,
} from "@/domain/ai/conversation";
import {
  initialListeningSession,
  type ListeningSession,
} from "@/domain/listening/session";
import { DEFAULT_PREFERENCES } from "@/domain/preferences/preferences";
import type {
  ProfileRestoreMarker,
  ProfileRestorePayload,
} from "@/domain/profile-recovery";
import {
  createWritingDraft,
  emptyWritingWorkspace,
  saveWritingRevision,
  type WritingWorkspace,
} from "@/domain/writing/workspace";
import type { ProfileRestoreJournalPort } from "@/application/profile-recovery";
import { PROFILE_SECTION_KEYS } from "@/application/profile-sections";
import {
  browserProfileRestoreCoordinator,
  exportBrowserProfile,
  inspectBrowserProfile,
  openBrowserProfileBackup,
  previewBrowserProfileRestore,
} from "@/infrastructure/profile/browser-backup";
import {
  createProfileBackupContainer,
  createProfileJsonBody,
  parseProfileJsonBody,
  type ProfileContainerInputPart,
} from "@/infrastructure/profile/container";
import {
  createMediaBackupSnapshot,
  sha256MediaBytes,
  type MediaBackupAssetMetadata,
} from "@/infrastructure/profile/media-backup";
import {
  PROFILE_EPOCH_KEY,
  PROFILE_RESTORE_KEY,
} from "@/infrastructure/profile/operation";
import type { LocalMediaAsset } from "@/infrastructure/listening/media-repository";

const mocks = vi.hoisted(() => ({
  writingRead: vi.fn(),
  writingApply: vi.fn(),
  mediaSnapshot: vi.fn(),
  mediaAsset: vi.fn(),
  mediaSession: vi.fn(),
  mediaApplyAsset: vi.fn(),
  mediaApplySession: vi.fn(),
  prepare: vi.fn(),
  journal: undefined as ProfileRestoreJournalPort | undefined,
}));

vi.mock("@/infrastructure/writing/repository", async (original) => ({
  ...(await original<typeof import("@/infrastructure/writing/repository")>()),
  readWritingProfileSnapshot: mocks.writingRead,
  applyWritingProfileRestore: mocks.writingApply,
}));
vi.mock("@/infrastructure/listening/media-repository", async (original) => ({
  ...(await original<
    typeof import("@/infrastructure/listening/media-repository")
  >()),
  readMediaBackupSnapshot: mocks.mediaSnapshot,
  readMediaBackupAsset: mocks.mediaAsset,
  readMediaBackupSession: mocks.mediaSession,
  restoreMediaBackupAsset: mocks.mediaApplyAsset,
  restoreMediaBackupSession: mocks.mediaApplySession,
}));
vi.mock("@/infrastructure/materials/purge-signal", () => ({
  prepareBrowserProfileRestore: mocks.prepare,
}));
vi.mock("@/infrastructure/profile/restore-journal", () => ({
  BrowserProfileRestoreJournal: class {
    constructor() {
      if (!mocks.journal)
        throw new Error("A test recovery journal is required.");
      return mocks.journal;
    }
  },
}));

const now = "2026-10-26T12:00:00.000Z";
const later = "2026-10-26T12:01:00.000Z";
const identity = { id: "0da11c37-d487-41fe-9780-aa8be13fa50e", createdAt: now };
const raw = JSON.stringify;
class TestStorage implements Storage {
  values = new Map<string, string>();
  writes: string[] = [];
  failKey: string | undefined;
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    if (key === this.failKey) {
      this.failKey = undefined;
      throw new Error("quota fixture");
    }
    this.writes.push(key);
    this.values.set(key, value);
  }
  seed(key: string, value: string) {
    this.values.set(key, value);
  }
}
class TestJournal implements ProfileRestoreJournalPort {
  marker: ProfileRestoreMarker | null = null;
  payloads: Record<string, ProfileRestorePayload> = {};
  stages = 0;
  receipts: string[] = [];
  failReceiptOnce = false;
  private current(id: string) {
    if (!this.marker || this.marker.id !== id)
      throw new Error("Missing test operation.");
    return structuredClone(this.marker);
  }
  private publish(marker: ProfileRestoreMarker) {
    this.marker = structuredClone(marker);
    store.setItem(PROFILE_RESTORE_KEY, JSON.stringify(marker));
    return this.current(marker.id);
  }
  async stage(
    marker: ProfileRestoreMarker,
    payloads: Record<string, ProfileRestorePayload>,
  ) {
    this.stages++;
    this.payloads = structuredClone(payloads);
    return this.publish(marker);
  }
  async load(id: string) {
    return this.marker?.id === id ? this.current(id) : null;
  }
  async payload(id: string, stepId: string) {
    this.current(id);
    return this.payloads[stepId] ?? null;
  }
  async begin(id: string) {
    const marker = this.current(id);
    store.setItem(PROFILE_EPOCH_KEY, marker.epoch);
    return this.publish({ ...marker, status: "running" });
  }
  async receipt(id: string, stepId: string) {
    if (this.failReceiptOnce) {
      this.failReceiptOnce = false;
      throw new Error("Receipt fixture failed after write.");
    }
    const marker = this.current(id);
    if (!marker.completed.includes(stepId)) marker.completed.push(stepId);
    this.receipts.push(stepId);
    return this.publish(marker);
  }
  async pause(id: string, failedStep?: string) {
    return this.publish({
      ...this.current(id),
      status: "partial",
      ...(failedStep ? { failedStep } : {}),
    });
  }
  async complete(id: string) {
    return this.publish({ ...this.current(id), status: "complete" });
  }
  async cancelBeforeWrites(id: string) {
    return this.publish({ ...this.current(id), status: "cancelled" });
  }
  async acceptPartial(id: string) {
    return this.publish({ ...this.current(id), status: "partial-accepted" });
  }
  async releaseFinished(id: string) {
    this.current(id);
    this.marker = null;
    store.removeItem(PROFILE_RESTORE_KEY);
  }
}

let store: TestStorage;
let journal: TestJournal;
let writingRaw: string | null;
let assets: Map<string, LocalMediaAsset>;
let sessions: Map<string, ListeningSession>;
function jsonPart(
  section:
    "learning" | "preferences" | "tutor-local" | "writing" | "media-metadata",
  value: string | null,
  validation: "valid" | "opaque" = "valid",
): ProfileContainerInputPart {
  return {
    id: `section:${section}` as const,
    kind: "json",
    section,
    validation,
    body: createProfileJsonBody(value),
  };
}
async function opened(parts: ProfileContainerInputPart[]) {
  return openBrowserProfileBackup(
    await createProfileBackupContainer({ ...identity, parts }),
  );
}
function pendingTutor(): TutorWorkspaceState {
  const value = emptyTutorWorkspace("local", "conversation-original");
  value.sessions[0].draft = "Please explain this passage.";
  value.sessions[0].messages = [
    {
      id: "original-message",
      requestId: "original-request",
      role: "user",
      text: "Please explain this passage.",
      occurredAt: now,
      status: "pending",
      sourceIds: ["private-source"],
    },
  ];
  value.sessions[0].pendingRequest = {
    requestId: "original-request",
    sessionId: "conversation-original",
    style: "mentor",
    sessionType: "guided-lesson",
    message: "Please explain this passage.",
    history: [],
    context: {
      id: "private-context",
      excerpt: "Previously permitted private passage.",
      sourceIds: ["private-source"],
    },
    consent: true,
  };
  return value;
}
function draft() {
  return createWritingDraft(emptyWritingWorkspace(), {
    id: "original-draft",
    revisionId: "original-revision",
    title: "Independent text",
    kind: "free",
    now,
  });
}
async function mediaFixture() {
  const bytes = new TextEncoder().encode("RIFF1234WAVE");
  const sha256 = await sha256MediaBytes(bytes.buffer);
  const metadata: MediaBackupAssetMetadata = {
    id: `media-${sha256}`,
    owner: "local",
    title: "My audio",
    fileName: "my-audio.wav",
    mime: "audio/wav",
    kind: "audio",
    byteLength: bytes.byteLength,
    createdAt: now,
    sha256,
  };
  const session = {
    ...initialListeningSession(metadata.id),
    revision: 9,
    position: 4,
    duration: 15,
    playedSeconds: 11,
    transcript: "My private transcript.",
    taskAttemptId: "attempt-not-a-uuid",
  };
  return {
    bytes,
    metadata,
    session,
    snapshot: await createMediaBackupSnapshot([metadata], [session]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store = new TestStorage();
  journal = new TestJournal();
  writingRaw = null;
  assets = new Map();
  sessions = new Map();
  mocks.journal = journal;
  vi.stubGlobal("window", { localStorage: store });
  mocks.prepare.mockResolvedValue(undefined);
  mocks.writingRead.mockImplementation(async () => ({
    raw: writingRaw,
    signature: writingRaw,
  }));
  mocks.writingApply.mockImplementation(
    async (next: WritingWorkspace, signature: string | null) => {
      if (signature !== writingRaw) throw new Error("Writing CAS conflict.");
      writingRaw = raw(next);
      return { raw: writingRaw, signature: writingRaw };
    },
  );
  mocks.mediaSnapshot.mockImplementation(async () => {
    const metadata: MediaBackupAssetMetadata[] = [];
    for (const { blob, ...item } of assets.values())
      metadata.push({
        ...item,
        sha256: await sha256MediaBytes(await blob.arrayBuffer()),
      });
    return createMediaBackupSnapshot(metadata, [...sessions.values()]);
  });
  mocks.mediaAsset.mockImplementation(
    async (id: string) => assets.get(id) ?? null,
  );
  mocks.mediaSession.mockImplementation(
    async (sourceId: string) => sessions.get(`session:${sourceId}`) ?? null,
  );
  mocks.mediaApplyAsset.mockImplementation(
    async (item: MediaBackupAssetMetadata, blob: Blob) => {
      assets.set(item.id, {
        id: item.id,
        owner: item.owner,
        title: item.title,
        fileName: item.fileName,
        mime: item.mime,
        kind: item.kind,
        byteLength: item.byteLength,
        createdAt: item.createdAt,
        blob,
      });
      return { applied: true, asset: item };
    },
  );
  mocks.mediaApplySession.mockImplementation(
    async (session: ListeningSession) => {
      sessions.set(session.id, structuredClone(session));
      return { applied: true, session };
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("browser profile export and recovery adapter", () => {
  it("exports exact opaque strings, writing bytes and absence without reading unrelated account credentials", async () => {
    const malformed = "{original damaged \ud800 bytes";
    store.seed(PROFILE_SECTION_KEYS.learning, malformed);
    store.seed("supabase.auth-token", "DO NOT EXPORT");
    store.seed("lexis.tutor.v1:account-other", "DO NOT EXPORT OTHER ACCOUNT");
    writingRaw = '{"version":90,"futureField":"Keep all unknown writing"}';
    const file = await exportBrowserProfile({
      sections: ["learning", "catalog", "writing"],
    });
    const backup = await openBrowserProfileBackup(file);
    expect(backup.manifest.parts.map((part) => part.id)).toEqual([
      "section:learning",
      "section:catalog",
      "section:writing",
    ]);
    expect(
      backup.manifest.parts.filter(
        (part) => part.kind === "json" && part.validation === "opaque",
      ),
    ).toHaveLength(2);
    expect(
      parseProfileJsonBody(await backup.readJsonPart("section:learning")),
    ).toBe(malformed);
    expect(
      parseProfileJsonBody(await backup.readJsonPart("section:catalog")),
    ).toBeNull();
    expect(
      parseProfileJsonBody(await backup.readJsonPart("section:writing")),
    ).toBe(writingRaw);
    expect(await file.text()).not.toContain("DO NOT EXPORT");
    expect(store.writes).toEqual([]);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.writingApply).not.toHaveBeenCalled();
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["learning", "writing"],
    });
    expect(preview.marker).toBeNull();
    expect(preview.rows.every((row) => row.conflict)).toBe(true);
    expect(store.getItem(PROFILE_SECTION_KEYS.learning)).toBe(malformed);
  });

  it("does not return a confirmed backup after an intervening autosave", async () => {
    const before = raw(draft());
    writingRaw = before;
    mocks.writingRead
      .mockResolvedValueOnce({ raw: before, signature: before })
      .mockImplementationOnce(async () => {
        writingRaw = raw(
          saveWritingRevision(draft(), {
            draftId: "original-draft",
            baseId: "original-revision",
            revisionId: "later-revision",
            text: "Saved while exporting",
            now: later,
          }),
        );
        return { raw: writingRaw, signature: writingRaw };
      });
    await expect(
      exportBrowserProfile({ sections: ["writing"] }),
    ).rejects.toThrow("changed while");
    expect(writingRaw).toContain("Saved while exporting");
    expect(mocks.writingApply).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
  });

  it("exports the real selected recording bytes with their matching private metadata and session history", async () => {
    const media = await mediaFixture();
    assets.set(media.metadata.id, {
      id: media.metadata.id,
      owner: "local",
      title: media.metadata.title,
      fileName: media.metadata.fileName,
      mime: media.metadata.mime,
      kind: media.metadata.kind,
      byteLength: media.metadata.byteLength,
      createdAt: media.metadata.createdAt,
      blob: new Blob([media.bytes]),
    });
    sessions.set(media.session.id, media.session);
    const file = await exportBrowserProfile({ sections: ["media-metadata"] });
    const backup = await openBrowserProfileBackup(file);
    expect(backup.manifest.parts.map((part) => part.id)).toEqual([
      "section:media-metadata",
      `asset:${media.metadata.id}`,
    ]);
    const metadata = JSON.parse(
      parseProfileJsonBody(
        await backup.readJsonPart("section:media-metadata"),
      )!,
    );
    expect(metadata).toEqual(media.snapshot);
    expect(
      new Uint8Array(
        await (
          await backup.readPart(`asset:${media.metadata.id}`)
        ).arrayBuffer(),
      ),
    ).toEqual(media.bytes);
    expect(mocks.mediaAsset).toHaveBeenCalledWith(
      media.metadata.id,
      media.metadata.sha256,
      expect.objectContaining({ signal: undefined }),
    );
    expect(mocks.mediaSnapshot).toHaveBeenCalledTimes(2);
    expect(store.writes).toEqual([]);
    expect(mocks.mediaApplyAsset).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("verifies tamper and media references before preview or any store writes", async () => {
    const file = await createProfileBackupContainer({
      ...identity,
      parts: [jsonPart("learning", raw(emptyState()))],
    });
    const bytes = new Uint8Array(await file.arrayBuffer());
    bytes[bytes.length - 1] ^= 1;
    await expect(openBrowserProfileBackup(new Blob([bytes]))).rejects.toThrow();
    await expect(
      opened([
        {
          id: "asset:unreferenced",
          kind: "media",
          body: new Blob(["RIFF1234WAVE"]),
        },
      ]),
    ).rejects.toThrow("without their metadata");
    const media = await mediaFixture();
    await expect(
      opened([jsonPart("media-metadata", raw(media.snapshot))]),
    ).rejects.toThrow("does not match");
    await expect(
      opened([
        jsonPart("media-metadata", raw(media.snapshot)),
        {
          id: `asset:${media.metadata.id}`,
          kind: "media",
          body: new Blob(["BAD-12-BYTES"]),
        },
      ]),
    ).rejects.toThrow("does not match");
    expect(store.writes).toEqual([]);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.mediaApplyAsset).not.toHaveBeenCalled();
    expect(mocks.mediaApplySession).not.toHaveBeenCalled();
  });

  it("lets a user omit a conflicted section while keeping its exact damaged bytes", async () => {
    const saved = saveSense(
      emptyState(),
      "missing-external-sense",
      "Original saved context",
      now,
    );
    const invalidPrefs = "{private damaged settings";
    store.seed(PROFILE_SECTION_KEYS.preferences, invalidPrefs);
    const backup = await opened([
      jsonPart("learning", raw(saved)),
      jsonPart("preferences", raw(DEFAULT_PREFERENCES)),
    ]);
    const conflicted = await previewBrowserProfileRestore(backup, {
      sections: ["learning", "preferences"],
      settings: "incoming",
    });
    expect(conflicted.marker).toBeNull();
    expect(
      conflicted.rows.find((row) => row.id === "preferences")?.conflict,
    ).toBeTruthy();
    expect(store.writes).toEqual([]);
    const selected = await previewBrowserProfileRestore(backup, {
      sections: ["learning"],
    });
    expect(selected.marker).not.toBeNull();
    expect(selected.rows.map((row) => row.id)).toEqual(["learning"]);
    const result = await browserProfileRestoreCoordinator().start({
      marker: selected.marker!,
      payloads: selected.payloads,
    });
    expect(result.status).toBe("complete");
    expect(
      JSON.parse(store.getItem(PROFILE_SECTION_KEYS.learning)!),
    ).toMatchObject({ saved: saved.saved });
    expect(store.getItem(PROFILE_SECTION_KEYS.preferences)).toBe(invalidPrefs);
  });

  it("restores pending Tutor input as cancelled history without renewing consent or sending the old request", async () => {
    const incoming = pendingTutor();
    const backup = await opened([jsonPart("tutor-local", raw(incoming))]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["tutor-local"],
    });
    expect(preview.rows[0].warnings.join(" ")).toContain("not renewed or sent");
    expect(incoming.sessions[0].pendingRequest?.consent).toBe(true);
    const coordinator = browserProfileRestoreCoordinator();
    const result = await coordinator.start({
      marker: preview.marker!,
      payloads: preview.payloads,
    });
    expect(result.status).toBe("complete");
    const restored = JSON.parse(
      store.getItem(PROFILE_SECTION_KEYS["tutor-local"])!,
    ) as TutorWorkspaceState;
    expect(restored.sessions[0].pendingRequest).toBeUndefined();
    expect(restored.sessions[0].draft).toBe("Please explain this passage.");
    expect(restored.sessions[0].messages[0]).toMatchObject({
      id: "original-message",
      requestId: "original-request",
      status: "cancelled",
    });
    expect(incoming.sessions[0].messages[0].status).toBe("pending");
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(store.getItem(PROFILE_RESTORE_KEY)).toContain('"status":"complete"');
  });

  it("preserves both writing revision branches and restores the exact media binary/session identities", async () => {
    const source = saveWritingRevision(draft(), {
      draftId: "original-draft",
      baseId: "original-revision",
      revisionId: "source-revision",
      text: "Independent source revision",
      now: later,
    });
    const current = saveWritingRevision(draft(), {
      draftId: "original-draft",
      baseId: "original-revision",
      revisionId: "current-revision",
      text: "Independent current revision",
      now: later,
    });
    writingRaw = raw(current);
    const media = await mediaFixture();
    const backup = await opened([
      jsonPart("writing", raw(source)),
      jsonPart("media-metadata", raw(media.snapshot)),
      {
        id: `asset:${media.metadata.id}`,
        kind: "media",
        body: new Blob([media.bytes]),
      },
    ]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["writing", "media-metadata"],
    });
    expect(preview.marker?.steps.map((step) => step.kind)).toEqual([
      "writing",
      "media-asset",
      "media-session",
    ]);
    const result = await browserProfileRestoreCoordinator().start({
      marker: preview.marker!,
      payloads: preview.payloads,
    });
    expect(result.status).toBe("complete");
    const writing = JSON.parse(writingRaw!) as WritingWorkspace;
    expect(writing.drafts[0].tips).toEqual([
      "current-revision",
      "source-revision",
    ]);
    expect(writing.drafts[0].headId).toBe("current-revision");
    expect(writing.drafts[0].revisions.map((item) => item.text)).toContain(
      "Independent source revision",
    );
    expect(writing.drafts[0].revisions.map((item) => item.text)).toContain(
      "Independent current revision",
    );
    expect(mocks.mediaApplyAsset).toHaveBeenCalledWith(
      media.metadata,
      expect.any(Blob),
      null,
      result.id,
    );
    expect(
      new Uint8Array(await assets.get(media.metadata.id)!.blob.arrayBuffer()),
    ).toEqual(media.bytes);
    expect(sessions.get(media.session.id)).toEqual(media.session);
    expect(result.completed).toEqual(result.steps.map((step) => step.id));
  });

  it("does not announce success when a store write fails and safely resumes the same staged identities", async () => {
    const incoming = saveSense(
      emptyState(),
      "original-sense",
      "Keep this context",
      now,
    );
    const backup = await opened([jsonPart("learning", raw(incoming))]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["learning"],
    });
    store.failKey = PROFILE_SECTION_KEYS.learning;
    const coordinator = browserProfileRestoreCoordinator();
    await expect(
      coordinator.start({
        marker: preview.marker!,
        payloads: preview.payloads,
      }),
    ).rejects.toMatchObject({ code: "write" });
    expect(journal.marker?.status).toBe("partial");
    expect(store.getItem(PROFILE_SECTION_KEYS.learning)).toBeNull();
    const resumed = await coordinator.resume(preview.marker!.id);
    expect(resumed.status).toBe("complete");
    expect(resumed.id).toBe(preview.marker!.id);
    expect(
      JSON.parse(store.getItem(PROFILE_SECTION_KEYS.learning)!).saved,
    ).toEqual(incoming.saved);
    expect(journal.stages).toBe(1);
  });

  it("checks actual saved data and records a lost receipt without applying a second copy", async () => {
    const incoming = saveSense(
      emptyState(),
      "original-sense",
      "Keep original",
      now,
    );
    const backup = await opened([jsonPart("learning", raw(incoming))]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["learning"],
    });
    const coordinator = browserProfileRestoreCoordinator();
    journal.failReceiptOnce = true;
    await expect(
      coordinator.start({
        marker: preview.marker!,
        payloads: preview.payloads,
      }),
    ).rejects.toMatchObject({ code: "journal" });
    expect(journal.marker?.completed).toEqual([]);
    expect(store.getItem(PROFILE_SECTION_KEYS.learning)).not.toBeNull();
    const restored = store.getItem(PROFILE_SECTION_KEYS.learning);
    const resumed = await coordinator.resume(preview.marker!.id);
    expect(resumed.status).toBe("complete");
    expect(store.getItem(PROFILE_SECTION_KEYS.learning)).toBe(restored);
    expect(
      store.writes.filter((key) => key === PROFILE_SECTION_KEYS.learning),
    ).toHaveLength(1);
  });

  it("refuses unsaved-work preparation before staging or changing any selected source", async () => {
    const backup = await opened([jsonPart("learning", raw(emptyState()))]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["learning"],
    });
    mocks.prepare.mockRejectedValueOnce(
      new Error("Unsaved independent writing"),
    );
    await expect(
      browserProfileRestoreCoordinator().start({
        marker: preview.marker!,
        payloads: preview.payloads,
      }),
    ).rejects.toMatchObject({ code: "preparation" });
    expect(journal.stages).toBe(0);
    expect(store.writes).toEqual([]);
    expect(store.getItem(PROFILE_SECTION_KEYS.learning)).toBeNull();
  });

  it("validates the semantics of every staged recording before applying an earlier learning step", async () => {
    const media = await mediaFixture();
    const mislabeled = { ...media.metadata, mime: "audio/mpeg" };
    const snapshot = await createMediaBackupSnapshot([mislabeled], []);
    const backup = await opened([
      jsonPart(
        "learning",
        raw(
          saveSense(
            emptyState(),
            "new-sense",
            "Independent original context",
            now,
          ),
        ),
      ),
      jsonPart("media-metadata", raw(snapshot)),
      {
        id: `asset:${mislabeled.id}`,
        kind: "media",
        body: new Blob([media.bytes]),
      },
    ]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["learning", "media-metadata"],
    });
    // Format validation may already reject the preview; if a plan is produced,
    // the coordinator must still reject before any of its selected targets change.
    if (preview.marker) {
      await expect(
        browserProfileRestoreCoordinator().start({
          marker: preview.marker,
          payloads: preview.payloads,
        }),
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(journal.marker?.status).toBe("partial");
    } else {
      expect(
        preview.rows.find((row) => row.id === "media-metadata")?.conflict,
      ).toBeTruthy();
    }
    expect(store.getItem(PROFILE_SECTION_KEYS.learning)).toBeNull();
    expect(mocks.mediaApplyAsset).not.toHaveBeenCalled();
    expect(
      store.writes.filter((key) =>
        Object.values(PROFILE_SECTION_KEYS).includes(key),
      ),
    ).toEqual([]);
  });

  it("binds a later staged section to its confirmed hash before an earlier selected write", async () => {
    const backup = await opened([
      jsonPart(
        "learning",
        raw(saveSense(emptyState(), "new-sense", "Independent source", now)),
      ),
      jsonPart("writing", raw(draft())),
    ]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["learning", "writing"],
    });
    const changed = saveWritingRevision(draft(), {
      draftId: "original-draft",
      baseId: "original-revision",
      revisionId: "substitute-revision",
      text: "Different from the confirmed preview",
      now: later,
    });
    preview.payloads["section:writing"] = {
      bytes: new Uint8Array(
        await createProfileJsonBody(raw(changed)).arrayBuffer(),
      ),
    };
    await expect(
      browserProfileRestoreCoordinator().start({
        marker: preview.marker!,
        payloads: preview.payloads,
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(store.getItem(PROFILE_SECTION_KEYS.learning)).toBeNull();
    expect(writingRaw).toBeNull();
    expect(mocks.writingApply).not.toHaveBeenCalled();
    expect(journal.marker?.completed).toEqual([]);
  });

  it("does not treat an adapter's success response as proof without matching saved media readback", async () => {
    const media = await mediaFixture();
    const backup = await opened([
      jsonPart("media-metadata", raw(media.snapshot)),
      {
        id: `asset:${media.metadata.id}`,
        kind: "media",
        body: new Blob([media.bytes]),
      },
    ]);
    const preview = await previewBrowserProfileRestore(backup, {
      sections: ["media-metadata"],
    });
    mocks.mediaApplyAsset.mockResolvedValueOnce({
      applied: true,
      asset: media.metadata,
    });
    await expect(
      browserProfileRestoreCoordinator().start({
        marker: preview.marker!,
        payloads: preview.payloads,
      }),
    ).rejects.toMatchObject({ code: "verification" });
    expect(journal.marker?.status).toBe("partial");
    expect(journal.marker?.completed).toEqual([]);
    expect(journal.receipts).toEqual([]);
    expect(assets.size).toBe(0);
    expect(mocks.mediaApplySession).not.toHaveBeenCalled();
  });

  it("reports inaccessible media separately and allows a useful export of other sections", async () => {
    mocks.mediaSnapshot.mockRejectedValue(
      new Error("A source recording contains unsupported original fields."),
    );
    const inventory = await inspectBrowserProfile();
    expect(
      inventory.sections.find((section) => section.id === "media-metadata"),
    ).toMatchObject({ status: "unavailable" });
    const file = await exportBrowserProfile({ sections: ["learning"] });
    expect((await openBrowserProfileBackup(file)).manifest.parts).toHaveLength(
      1,
    );
    await expect(
      exportBrowserProfile({ sections: ["media-metadata"] }),
    ).rejects.toThrow("unsupported original fields");
    expect(store.writes).toEqual([]);
  });
});
