import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseProfileRestoreMarker,
  type ProfileRestoreMarker,
  type ProfileRestorePayload,
} from "@/domain/profile-recovery";
import {
  BrowserProfileRestoreJournal,
  type ProfileRestorePayloadStore,
  type StagedProfileRestoreJob,
} from "@/infrastructure/profile/restore-journal";
import {
  assertProfileRestoreWrite,
  PROFILE_EPOCH_KEY,
  PROFILE_RESTORE_KEY,
  readProfileRestoreMarker,
  type ProfileStorage,
} from "@/infrastructure/profile/operation";
import { LOCAL_PURGE_MARKER } from "@/infrastructure/storage/preferences";

const firstAt = "2026-10-26T12:00:00.000Z";
const laterAt = "2026-10-26T12:01:00.000Z";
const hash = "a".repeat(64);
function marker(): ProfileRestoreMarker {
  return {
    version: 1,
    id: "restore-test",
    owner: "local",
    fileHash: hash,
    epoch: "epoch-test",
    status: "staged",
    startedAt: firstAt,
    updatedAt: firstAt,
    steps: [
      {
        id: "local:learning",
        kind: "local",
        target: "learning",
        beforeHash: null,
        afterHash: hash,
      },
      {
        id: "writing:local",
        kind: "writing",
        target: "local",
        beforeHash: null,
        afterHash: "b".repeat(64),
      },
    ],
    completed: [],
  };
}
function memory(): ProfileStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
function payloads(): Record<string, ProfileRestorePayload> {
  return {
    "local:learning": {
      bytes: new TextEncoder().encode('{"raw":"learning bytes"}'),
    },
    "writing:local": {
      bytes: new TextEncoder().encode('{"raw":"writing bytes"}'),
      metadata: '{"version":1}',
    },
  };
}
class MemoryPayloadStore implements ProfileRestorePayloadStore {
  jobs = new Map<string, StagedProfileRestoreJob>();
  data = new Map<string, Record<string, ProfileRestorePayload>>();
  failMetadata = false;
  failPayload: string | undefined;
  afterStage: (() => void) | undefined;
  onPayload: ((id: string, stepId: string) => void) | undefined;
  async stage(
    plan: ProfileRestoreMarker,
    incoming: Record<string, ProfileRestorePayload>,
  ) {
    this.jobs.set(plan.id, { marker: structuredClone(plan), ready: true });
    this.data.set(plan.id, structuredClone(incoming));
    this.afterStage?.();
  }
  async load(id: string) {
    return structuredClone(this.jobs.get(id) ?? null);
  }
  async payload(id: string, stepId: string) {
    this.onPayload?.(id, stepId);
    if (this.failPayload === stepId)
      throw new Error("Staged recovery payload changed.");
    return structuredClone(this.data.get(id)?.[stepId] ?? null);
  }
  async payloadIds(id: string) {
    return Object.keys(this.data.get(id) ?? {});
  }
  async saveMetadata(plan: ProfileRestoreMarker) {
    if (this.failMetadata) throw new Error("Metadata persistence interrupted.");
    this.jobs.set(plan.id, { marker: structuredClone(plan), ready: true });
  }
  async deletePayloads(id: string) {
    this.data.delete(id);
  }
  async remove(id: string) {
    this.data.delete(id);
    this.jobs.delete(id);
  }
  async prune() {}
}
function setup() {
  const storage = memory();
  const store = new MemoryPayloadStore();
  const notifications: ProfileRestoreMarker[] = [];
  const journal = new BrowserProfileRestoreJournal({
    storage,
    store,
    now: () => laterAt,
    notify: (value) => notifications.push(value),
  });
  return { storage, store, journal, notifications };
}

describe("bounded profile recovery journal", () => {
  it("stages and reads back every payload before publishing a safety marker", async () => {
    const { storage, store, journal, notifications } = setup();
    store.onPayload = () =>
      expect(storage.getItem(PROFILE_RESTORE_KEY)).toBeNull();
    const plan = await journal.stage(marker(), payloads());
    store.onPayload = undefined;
    expect(readProfileRestoreMarker(storage)).toEqual(plan);
    expect(await journal.payload(plan.id, plan.steps[1].id)).toEqual(
      payloads()[plan.steps[1].id],
    );
    expect(storage.getItem(PROFILE_EPOCH_KEY)).toBeNull();
    expect(notifications).toHaveLength(1);
    expect(() => assertProfileRestoreWrite(plan.id, storage)).toThrow(
      /no longer authorized/u,
    );
  });

  it("does not publish a marker when staging readback is missing or damaged", async () => {
    for (const damage of ["missing", "bytes", "metadata"] as const) {
      const { storage, store, journal } = setup();
      store.afterStage = () => {
        const data = store.data.get(marker().id)!;
        if (damage === "missing") delete data["writing:local"];
        else if (damage === "bytes") data["writing:local"].bytes[0] = 0;
        else data["writing:local"].metadata = "Changed metadata";
      };
      await expect(journal.stage(marker(), payloads())).rejects.toThrow(
        /could not be verified/u,
      );
      expect(storage.getItem(PROFILE_RESTORE_KEY)).toBeNull();
      expect(storage.getItem(PROFILE_EPOCH_KEY)).toBeNull();
      expect(store.data.has(marker().id)).toBe(false);
    }
  });

  it("rejects incomplete payload selections and an aborted preparation without source writes", async () => {
    const { storage, store, journal } = setup();
    await expect(
      journal.stage(marker(), {
        "local:learning": payloads()["local:learning"],
      }),
    ).rejects.toThrow(/do not match/u);
    const cancel = new AbortController();
    cancel.abort();
    await expect(
      journal.stage(marker(), payloads(), { signal: cancel.signal }),
    ).rejects.toThrow(/cancelled/u);
    expect(storage.values.size).toBe(0);
    expect(store.jobs.size).toBe(0);
  });

  it("reserves room for every receipt before accepting a plan", async () => {
    const { storage, store, journal } = setup();
    const plan = marker();
    plan.steps = Array.from({ length: 1000 }, (_, index) => ({
      id: `${index}:${"x".repeat(190)}`,
      kind: "media-session" as const,
      target: `${index}:${"y".repeat(500)}`,
      beforeHash: null,
      afterHash: hash,
    }));
    const data = Object.fromEntries(
      plan.steps.map((step) => [step.id, { bytes: new Uint8Array([1]) }]),
    );
    await expect(journal.stage(plan, data)).rejects.toThrow(
      /safe journal limit/u,
    );
    expect(storage.values.size).toBe(0);
    expect(store.jobs.size).toBe(0);
  });

  it("keeps the original profile unchanged if local marker storage is full", async () => {
    const { storage, store, journal } = setup();
    storage.setItem("lexis.learning.v1", "original damaged bytes");
    storage.setItem = () => {
      throw new Error("Storage is full");
    };
    await expect(journal.stage(marker(), payloads())).rejects.toThrow(
      /Storage is full/u,
    );
    expect([...storage.values]).toEqual([
      ["lexis.learning.v1", "original damaged bytes"],
    ]);
    expect(store.jobs.size).toBe(0);
  });

  it("does not discard staged data when a post-publication read fails", async () => {
    const { storage, store, journal } = setup();
    const get = storage.getItem;
    let failed = false;
    storage.getItem = (key) => {
      if (
        !failed &&
        key === PROFILE_RESTORE_KEY &&
        storage.values.has(PROFILE_RESTORE_KEY)
      ) {
        failed = true;
        throw new Error("Read interrupted");
      }
      return get(key);
    };
    await expect(journal.stage(marker(), payloads())).rejects.toThrow(
      /Read interrupted/u,
    );
    expect(readProfileRestoreMarker(storage)?.status).toBe("staged");
    expect(store.data.has(marker().id)).toBe(true);
    expect((await journal.begin(marker().id)).status).toBe("running");
  });

  it("stops before authorizing targets if any staged payload disappeared or fails its hash", async () => {
    for (const missing of [true, false]) {
      const { storage, store, journal } = setup();
      await journal.stage(marker(), payloads());
      if (missing) delete store.data.get(marker().id)!["writing:local"];
      else store.failPayload = "writing:local";
      await expect(journal.begin(marker().id)).rejects.toThrow(
        /missing|changed/u,
      );
      expect(readProfileRestoreMarker(storage)?.status).toBe("staged");
      expect(storage.getItem(PROFILE_EPOCH_KEY)).toBeNull();
    }
  });

  it("records a canonical prefix and cannot report completion before all verified receipts", async () => {
    const { storage, journal } = setup();
    await journal.stage(marker(), payloads());
    await journal.begin(marker().id);
    expect(assertProfileRestoreWrite(marker().id, storage).status).toBe(
      "running",
    );
    await expect(journal.receipt(marker().id, "writing:local")).rejects.toThrow(
      /step order/u,
    );
    await expect(journal.complete(marker().id)).rejects.toThrow(
      /every selected step/u,
    );
    await journal.receipt(marker().id, "local:learning");
    await journal.receipt(marker().id, "local:learning");
    expect(readProfileRestoreMarker(storage)?.completed).toEqual([
      "local:learning",
    ]);
    await journal.receipt(marker().id, "writing:local");
    const complete = await journal.complete(marker().id);
    expect(complete.status).toBe("complete");
    expect(await journal.complete(marker().id)).toEqual(complete);
    expect(storage.getItem(PROFILE_RESTORE_KEY)).not.toBeNull();
    expect(() => assertProfileRestoreWrite(marker().id, storage)).toThrow(
      /no longer authorized/u,
    );
  });

  it("keeps the authoritative receipt when its secondary metadata write was interrupted", async () => {
    const { storage, store, journal } = setup();
    await journal.stage(marker(), payloads());
    await journal.begin(marker().id);
    store.failMetadata = true;
    await expect(
      journal.receipt(marker().id, "local:learning"),
    ).rejects.toThrow(/interrupted/u);
    expect(readProfileRestoreMarker(storage)?.completed).toEqual([
      "local:learning",
    ]);
    store.failMetadata = false;
    const reopened = new BrowserProfileRestoreJournal({ storage, store });
    expect((await reopened.load(marker().id))?.completed).toEqual([
      "local:learning",
    ]);
    expect(
      (await reopened.receipt(marker().id, "local:learning")).completed,
    ).toEqual(["local:learning"]);
  });

  it("resumes a partial operation with its original identities and ordered progress", async () => {
    const { storage, store, journal } = setup();
    await journal.stage(marker(), payloads());
    await journal.begin(marker().id);
    await journal.receipt(marker().id, "local:learning");
    await journal.pause(marker().id, "writing:local");
    expect(() => assertProfileRestoreWrite(marker().id, storage)).toThrow();
    const reopened = new BrowserProfileRestoreJournal({ storage, store });
    const resumed = await reopened.begin(marker().id);
    expect(resumed.completed).toEqual(["local:learning"]);
    expect(resumed.steps).toEqual(marker().steps);
    expect(resumed.epoch).toBe(marker().epoch);
    expect(resumed.failedStep).toBeUndefined();
    await reopened.receipt(marker().id, "writing:local");
    await reopened.complete(marker().id);
    await reopened.releaseFinished(marker().id);
    expect(readProfileRestoreMarker(storage)).toBeNull();
    expect(storage.getItem(PROFILE_EPOCH_KEY)).toBe(marker().epoch);
    expect(store.data.has(marker().id)).toBe(false);
    expect(store.jobs.get(marker().id)?.marker.status).toBe("complete");
  });

  it("does not interpret missing receipts as proof that running recovery wrote nothing", async () => {
    const { journal } = setup();
    await journal.stage(marker(), payloads());
    await journal.begin(marker().id);
    await expect(journal.cancelBeforeWrites(marker().id)).rejects.toThrow(
      /already begun/u,
    );
    await expect(journal.releaseFinished(marker().id)).rejects.toThrow(
      /explicitly resolve/u,
    );
    await journal.pause(marker().id, "local:learning");
    const accepted = await journal.acceptPartial(marker().id);
    expect(accepted.status).toBe("partial-accepted");
    expect(accepted.completed).toEqual([]);
    await journal.releaseFinished(marker().id);
  });

  it("allows cancellation of a staged-only plan and retains it until explicit cleanup", async () => {
    const { storage, store, journal } = setup();
    await journal.stage(marker(), payloads());
    await journal.cancelBeforeWrites(marker().id);
    expect(readProfileRestoreMarker(storage)?.status).toBe("cancelled");
    expect(store.data.has(marker().id)).toBe(true);
    await journal.releaseFinished(marker().id);
    expect(readProfileRestoreMarker(storage)).toBeNull();
    expect(store.data.has(marker().id)).toBe(false);
    expect(storage.getItem(PROFILE_EPOCH_KEY)).toBeNull();
  });

  it("does not revive a finished operation that was cancelled while begin verified payloads", async () => {
    const { storage, store, journal } = setup();
    await journal.stage(marker(), payloads());
    let once = false;
    store.onPayload = () => {
      if (!once) {
        once = true;
        const cancelled = {
          ...readProfileRestoreMarker(storage)!,
          status: "cancelled" as const,
        };
        storage.setItem(PROFILE_RESTORE_KEY, JSON.stringify(cancelled));
      }
    };
    await expect(journal.begin(marker().id)).rejects.toThrow(/resolved while/u);
    expect(readProfileRestoreMarker(storage)?.status).toBe("cancelled");
    expect(storage.getItem(PROFILE_EPOCH_KEY)).toBeNull();
  });

  it("never reauthorizes restoration after the profile epoch changes", async () => {
    const { storage, journal } = setup();
    await journal.stage(marker(), payloads());
    await journal.begin(marker().id);
    await journal.pause(marker().id);
    storage.setItem(PROFILE_EPOCH_KEY, "a-different-profile");
    await expect(journal.begin(marker().id)).rejects.toThrow(
      /profile changed/u,
    );
    expect(() => assertProfileRestoreWrite(marker().id, storage)).toThrow();
  });

  it("gives deletion priority and preserves unreadable marker bytes", async () => {
    const { storage, journal } = setup();
    storage.setItem(PROFILE_RESTORE_KEY, "{unreadable original");
    expect(() => readProfileRestoreMarker(storage)).toThrow(/original bytes/u);
    expect(storage.getItem(PROFILE_RESTORE_KEY)).toBe("{unreadable original");
    storage.setItem(LOCAL_PURGE_MARKER, '{"status":"running"}');
    await expect(journal.load(marker().id)).rejects.toThrow(/deletion/u);
    expect(() => assertProfileRestoreWrite(marker().id, storage)).toThrow(
      /deletion/u,
    );
  });

  it("does not mistake failed cooperative notifications for failed durable storage", async () => {
    const { storage, store } = setup();
    const journal = new BrowserProfileRestoreJournal({
      storage,
      store,
      notify: () => {
        throw new Error("Channel unavailable");
      },
    });
    await journal.stage(marker(), payloads());
    await journal.begin(marker().id);
    expect(readProfileRestoreMarker(storage)?.status).toBe("running");
  });
});

describe("strict recovery marker contract", () => {
  it("rejects unknown keys, duplicate targets, invalid receipt order and false completion", () => {
    const original = marker();
    for (const damaged of [
      { ...original, extra: true },
      {
        ...original,
        steps: [original.steps[0], { ...original.steps[0], id: "duplicate" }],
      },
      { ...original, completed: ["writing:local"] },
      { ...original, completed: ["missing"] },
      { ...original, completed: ["local:learning", "local:learning"] },
      { ...original, status: "complete" },
      { ...original, startedAt: "not a date" },
      { ...original, fileHash: "not a hash" },
      { ...original, steps: [{ ...original.steps[0], target: "\u0000" }] },
    ])
      expect(() => parseProfileRestoreMarker(damaged)).toThrow(/unreadable/u);
    expect(parseProfileRestoreMarker(original)).toEqual(original);
  });
});

describe("document generation write barrier", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("blocks a stale first write even when a frozen browser tab missed the marker event", async () => {
    const storage = memory();
    vi.stubGlobal("window", { localStorage: storage });
    const { assertLocalWritesAllowed } =
      await import("@/infrastructure/storage/local-write-guard");
    storage.setItem(PROFILE_EPOCH_KEY, "a-restored-profile");
    expect(() => assertLocalWritesAllowed(storage)).toThrow(
      /earlier local profile/u,
    );
  });

  it("does not revive old closures after a restore marker disappears", async () => {
    const storage = memory();
    const { assertLocalWritesAllowed } =
      await import("@/infrastructure/storage/local-write-guard");
    assertLocalWritesAllowed(storage);
    storage.setItem(PROFILE_RESTORE_KEY, JSON.stringify(marker()));
    expect(() => assertLocalWritesAllowed(storage)).toThrow(
      /recovery has paused/u,
    );
    storage.removeItem(PROFILE_RESTORE_KEY);
    expect(() => assertLocalWritesAllowed(storage)).toThrow(
      /recovery has paused/u,
    );
  });

  it("starts a reopened recovery page suspended even if the operation is cancelled before its first ordinary write", async () => {
    const storage = memory();
    storage.setItem(PROFILE_RESTORE_KEY, JSON.stringify(marker()));
    vi.stubGlobal("window", { localStorage: storage });
    const { assertLocalWritesAllowed } =
      await import("@/infrastructure/storage/local-write-guard");
    storage.removeItem(PROFILE_RESTORE_KEY);
    expect(() => assertLocalWritesAllowed(storage)).toThrow(
      /recovery has paused/u,
    );
  });
});
