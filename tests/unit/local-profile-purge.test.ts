import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_PURGE_CONFIRMATION,
  previewLocalProfile,
  purgeLocalProfile,
  restartLocalProfile,
  browserPurgeEnvironment,
  type LocalProfileEnvironment,
  type PurgeKeyStore,
  type PurgeWorker,
} from "../../src/infrastructure/storage/local-profile-purge";
import { LOCAL_PURGE_MARKER } from "../../src/infrastructure/storage/preferences";
import { PROFILE_EPOCH_KEY } from "../../src/infrastructure/profile/operation";
const freshEpoch = "98dd39c2-960b-4f55-a0b2-07614b8848a7";

function store(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const port: PurgeKeyStore = {
    keys: () => [...values.keys()],
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
  return { values, port };
}
function fixture() {
  const local = store({
    "lexis.learning.v1": "damaged bytes",
    "lexis.preferences.v1": "preferences",
    "other.app": "untouched",
    "lexis-lookalike": "untouched",
  });
  const session = store({
    "lexis.dictionary.context.v1": "private excerpt",
    "other.session": "untouched",
  });
  const databases = new Set([
    "lexis.writing.v1",
    "lexis.media.local.v1",
    "lexis.future.v3",
    "other.database",
  ]);
  const caches = new Set([
    "lexis-public-shell-v1",
    "lexis.lookup.v1",
    "other.cache",
    "lexisx-cache",
  ]);
  const workers: PurgeWorker[] = [];
  const worker = (scope: string, scripts: string[]) => {
    const registration: PurgeWorker = {
      scope,
      scripts,
      prepare: vi.fn(async () => {}),
      unregister: vi.fn(async () => {
        workers.splice(workers.indexOf(registration), 1);
        return true;
      }),
    };
    workers.push(registration);
    return registration;
  };
  const own = worker("https://lexis.test/", ["https://lexis.test/sw.js"]);
  const other = worker("https://lexis.test/other/", [
    "https://lexis.test/other/sw.js",
  ]);
  const foreign = worker("https://other.test/", ["https://other.test/sw.js"]);
  const replacement = worker("https://lexis.test/replace/", [
    "https://lexis.test/sw.js",
    "https://lexis.test/unrelated.js",
  ]);
  const env: LocalProfileEnvironment = {
    origin: "https://lexis.test",
    local: local.port,
    session: session.port,
    databases: async () => ({ names: [...databases], exhaustive: true }),
    deleteDatabase: async (name) => {
      databases.delete(name);
    },
    caches: async () => [...caches],
    deleteCache: async (name) => caches.delete(name),
    workers: async () => [...workers],
    prepare: vi.fn(async () => {}),
    newEpoch: () => freshEpoch,
  };
  return {
    env,
    local,
    session,
    databases,
    caches,
    own,
    other,
    foreign,
    replacement,
  };
}

describe("explicit browser profile removal", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("previews only LEXIS resources and does not mutate damaged original bytes", async () => {
    const state = fixture();
    expect(await previewLocalProfile(state.env)).toMatchObject({
      localKeys: ["lexis.learning.v1", "lexis.preferences.v1"],
      sessionKeys: ["lexis.dictionary.context.v1"],
      databases: [
        "lexis.future.v3",
        "lexis.media.local.v1",
        "lexis.writing.v1",
      ],
      caches: ["lexis-public-shell-v1", "lexis.lookup.v1"],
      serviceWorkers: ["https://lexis.test/"],
      pending: false,
      deletionStatus: null,
    });
    expect(state.local.values.get("lexis.learning.v1")).toBe("damaged bytes");
    expect(state.env.prepare).not.toHaveBeenCalled();
  });
  it("requires exact confirmation before any marker, cleanup or deletion", async () => {
    const state = fixture();
    await expect(purgeLocalProfile("delete", state.env)).rejects.toThrow(
      /Type DELETE LOCAL PROFILE/,
    );
    expect(state.local.values.has(LOCAL_PURGE_MARKER)).toBe(false);
    expect(state.databases.size).toBe(4);
    expect(state.env.prepare).not.toHaveBeenCalled();
  });
  it("sets the safety marker before draining work and preserves unrelated browser resources", async () => {
    const state = fixture();
    state.env.prepare = async () => {
      expect(JSON.parse(state.local.port.get(LOCAL_PURGE_MARKER)!)).toEqual({
        version: 1,
        status: "deleting",
      });
    };
    const result = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(result.complete).toBe(true);
    expect(result.failures).toEqual([]);
    expect([...state.local.values.keys()].sort()).toEqual(
      ["lexis-lookalike", LOCAL_PURGE_MARKER, "other.app"].sort(),
    );
    expect([...state.session.values.keys()]).toEqual(["other.session"]);
    expect([...state.databases]).toEqual(["other.database"]);
    expect([...state.caches]).toEqual(["other.cache", "lexisx-cache"]);
    expect(state.own.unregister).toHaveBeenCalledOnce();
    for (const worker of [state.other, state.foreign, state.replacement])
      expect(worker.unregister).not.toHaveBeenCalled();
    expect((await previewLocalProfile(state.env)).deletionStatus).toBe(
      "complete",
    );
    restartLocalProfile(state.env);
    expect(state.local.values.has(LOCAL_PURGE_MARKER)).toBe(false);
    expect(state.local.values.get(PROFILE_EPOCH_KEY)).toBe(freshEpoch);
  });
  it("does not delete anything if the durable safety marker cannot be saved", async () => {
    const state = fixture();
    state.env.local.set = () => {
      throw new Error("Storage denied");
    };
    await expect(
      purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env),
    ).rejects.toThrow(/No data was removed/);
    expect(state.local.values.get("lexis.learning.v1")).toBe("damaged bytes");
    expect(state.env.prepare).not.toHaveBeenCalled();
    expect(state.own.unregister).not.toHaveBeenCalled();
  });
  it("keeps all records if a workspace cannot finish stopping", async () => {
    const state = fixture();
    state.env.prepare = async () => {
      throw new Error("Pending draft transaction failed");
    };
    const result = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(result.complete).toBe(false);
    expect(result.failures[0]).toMatch(/could not be stopped safely/);
    expect(state.local.values.get("lexis.learning.v1")).toBe("damaged bytes");
    expect(state.own.unregister).not.toHaveBeenCalled();
    expect(() => restartLocalProfile(state.env)).toThrow(
      /Finish local deletion/,
    );
  });
  it("reports a blocked database, keeps a partial marker, and safely resumes on retry", async () => {
    const state = fixture();
    state.env.deleteDatabase = async (name) => {
      if (name === "lexis.writing.v1")
        throw new Error("Blocked by another tab");
      state.databases.delete(name);
    };
    const first = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(first.complete).toBe(false);
    expect(first.remaining.databases).toEqual(["lexis.writing.v1"]);
    expect(
      first.failures.some((failure) => failure.includes("lexis.writing.v1")),
    ).toBe(true);
    expect((await previewLocalProfile(state.env)).deletionStatus).toBe(
      "partial",
    );
    expect(() => restartLocalProfile(state.env)).toThrow();
    state.env.deleteDatabase = async (name) => {
      state.databases.delete(name);
    };
    expect(
      (await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env)).complete,
    ).toBe(true);
    expect([...state.databases]).toEqual(["other.database"]);
  });
  it("does not claim success if a late writer recreates a private record", async () => {
    const state = fixture();
    state.env.deleteCache = async (name) => {
      state.caches.delete(name);
      state.local.values.set("lexis.late.v1", "late response");
      return true;
    };
    const result = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(result.complete).toBe(false);
    expect(result.remaining.localKeys).toEqual(["lexis.late.v1"]);
    expect(JSON.parse(state.local.values.get(LOCAL_PURGE_MARKER)!).status).toBe(
      "partial",
    );
  });
  it("requires an offline worker acknowledgement before unregistering it", async () => {
    const state = fixture();
    const ordering: string[] = [];
    state.own.prepare = async () => {
      ordering.push("drained");
    };
    state.own.unregister = async () => {
      expect(ordering).toEqual(["drained"]);
      ordering.push("unregistered");
      state.env.workers = async () => [
        state.other,
        state.foreign,
        state.replacement,
      ];
      return true;
    };
    const result = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(result.complete).toBe(true);
    expect(ordering).toEqual(["drained", "unregistered"]);
  });
  it("retains partial state if the offline worker cannot stop cache writes", async () => {
    const state = fixture();
    state.own.prepare = async () => {
      throw new Error("No acknowledgement");
    };
    const result = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(result.complete).toBe(false);
    expect(state.own.unregister).not.toHaveBeenCalled();
    expect(result.remaining.serviceWorkers).toEqual(["https://lexis.test/"]);
    expect(JSON.parse(state.local.port.get(LOCAL_PURGE_MARKER)!).status).toBe(
      "partial",
    );
  });
  it("treats failed inspection as unverifiable, and keeps deletion blocked", async () => {
    const state = fixture();
    state.env.caches = async () => {
      throw new Error("Cache API denied");
    };
    const preview = await previewLocalProfile(state.env);
    expect(preview.warnings).toContain(
      "Offline caches could not be inspected.",
    );
    const result = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(result.complete).toBe(false);
    expect(result.failures).toContain("Offline caches could not be inspected.");
  });
  it("supports known databases without falsely claiming exhaustive enumeration", async () => {
    const state = fixture();
    state.env.databases = async () => ({
      names: ["lexis.writing.v1", "lexis.media.local.v1"],
      exhaustive: false,
    });
    const preview = await previewLocalProfile(state.env);
    expect(preview.databaseDiscoveryComplete).toBe(false);
    expect(preview.warnings).toHaveLength(1);
    const result = await purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
    expect(result.complete).toBe(false);
    expect(result.remaining.databaseDiscoveryComplete).toBe(false);
    expect(result.remaining.warnings[0]).toMatch(
      /unknown legacy databases cannot be enumerated/,
    );
    expect(
      result.failures.some((failure) =>
        failure.includes("Clear this site's data"),
      ),
    ).toBe(true);
    expect(state.databases.has("lexis.future.v3")).toBe(true);
  });
  it("bounds unresponsive workspace cleanup and leaves recoverable original data", async () => {
    vi.useFakeTimers();
    try {
      const state = fixture();
      state.env.prepare = () => new Promise(() => {});
      const pending = purgeLocalProfile(LOCAL_PURGE_CONFIRMATION, state.env);
      await vi.advanceTimersByTimeAsync(5001);
      expect((await pending).complete).toBe(false);
      expect(state.local.values.get("lexis.learning.v1")).toBe("damaged bytes");
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves a nonprivate generation during deletion without counting it as remaining private data", async () => {
    const state = fixture();
    const previous = "9c75c984-4b70-4581-b23f-48f02ba2122e";
    state.local.port.set(PROFILE_EPOCH_KEY, previous);
    expect((await previewLocalProfile(state.env)).localKeys).not.toContain(
      PROFILE_EPOCH_KEY,
    );
    const removed = await purgeLocalProfile(
      LOCAL_PURGE_CONFIRMATION,
      state.env,
    );
    expect(removed.complete).toBe(true);
    expect(removed.deleted.localKeys).not.toContain(PROFILE_EPOCH_KEY);
    expect(removed.remaining.localKeys).toEqual([]);
    expect(state.local.port.get(PROFILE_EPOCH_KEY)).toBe(previous);
    restartLocalProfile(state.env);
    expect(state.local.port.get(PROFILE_EPOCH_KEY)).toBe(freshEpoch);
    expect(state.local.port.get(LOCAL_PURGE_MARKER)).toBeNull();
  });

  it("rotates and verifies the generation before releasing a completed deletion barrier", () => {
    const state = fixture();
    state.local.port.set(
      LOCAL_PURGE_MARKER,
      '{"version":1,"status":"complete"}',
    );
    const originalRemove = state.local.port.remove;
    state.local.port.remove = (key) => {
      expect(key).toBe(LOCAL_PURGE_MARKER);
      expect(state.local.port.get(PROFILE_EPOCH_KEY)).toBe(freshEpoch);
      originalRemove(key);
    };
    restartLocalProfile(state.env);
    expect(state.local.port.get(LOCAL_PURGE_MARKER)).toBeNull();
  });

  it("keeps deletion blocked when generation creation, persistence or readback fails", () => {
    for (const failure of [
      "invalid",
      "collision",
      "denied",
      "readback",
    ] as const) {
      const state = fixture();
      const complete = '{"version":1,"status":"complete"}';
      state.local.port.set(LOCAL_PURGE_MARKER, complete);
      if (failure === "invalid") state.env.newEpoch = () => "not a UUID";
      if (failure === "collision")
        state.local.port.set(PROFILE_EPOCH_KEY, freshEpoch);
      if (failure === "denied")
        state.local.port.set = () => {
          throw new Error("Denied");
        };
      if (failure === "readback") state.local.port.set = () => {};
      expect(() => restartLocalProfile(state.env)).toThrow(
        /could not be prepared safely/u,
      );
      expect(state.local.port.get(LOCAL_PURGE_MARKER)).toBe(complete);
    }
  });

  it("does not clear a new deletion marker that appeared while preparing the fresh generation", () => {
    const state = fixture();
    state.local.port.set(
      LOCAL_PURGE_MARKER,
      '{"version":1,"status":"complete"}',
    );
    const set = state.local.port.set;
    state.local.port.set = (key, value) => {
      set(key, value);
      if (key === PROFILE_EPOCH_KEY)
        set(LOCAL_PURGE_MARKER, '{"version":1,"status":"deleting"}');
    };
    expect(() => restartLocalProfile(state.env)).toThrow(/deletion changed/u);
    expect(JSON.parse(state.local.port.get(LOCAL_PURGE_MARKER)!)).toEqual({
      version: 1,
      status: "deleting",
    });
  });

  it("preserves an unreadable deletion marker and does not report a silent removal as success", () => {
    const state = fixture();
    state.local.port.set(LOCAL_PURGE_MARKER, "{original damaged marker");
    expect(() => restartLocalProfile(state.env)).toThrow(
      /unreadable safety marker has been preserved/u,
    );
    expect(state.local.port.get(LOCAL_PURGE_MARKER)).toBe(
      "{original damaged marker",
    );
    expect(state.local.port.get(PROFILE_EPOCH_KEY)).toBeNull();
    state.local.port.set(
      LOCAL_PURGE_MARKER,
      '{"version":1,"status":"complete"}',
    );
    state.local.port.remove = () => {};
    expect(() => restartLocalProfile(state.env)).toThrow(
      /could not be cleared/u,
    );
    expect(state.local.port.get(LOCAL_PURGE_MARKER)).not.toBeNull();
  });

  it("blocks a frozen page's first stale write after a completed deletion and fresh start", async () => {
    const state = fixture();
    const storage = { getItem: (key: string) => state.local.port.get(key) };
    vi.stubGlobal("window", { localStorage: storage });
    vi.resetModules();
    const { assertLocalWritesAllowed } =
      await import("@/infrastructure/storage/local-write-guard");
    // No write/guard call or purge event is delivered to this old document.
    state.local.port.set(
      LOCAL_PURGE_MARKER,
      '{"version":1,"status":"complete"}',
    );
    restartLocalProfile(state.env);
    expect(() => assertLocalWritesAllowed(storage)).toThrow(
      /earlier local profile/u,
    );
  });

  it("includes private staged recovery payloads in known database cleanup on limited browsers", async () => {
    const values = new Map<string, string>();
    const storage = {
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    vi.stubGlobal("window", {
      indexedDB: {},
      location: { origin: "https://lexis.test" },
      localStorage: storage,
      sessionStorage: storage,
    });
    expect(await browserPurgeEnvironment().databases()).toEqual({
      names: [
        "lexis.writing.v1",
        "lexis.media.local.v1",
        "lexis.profile-backup.v1",
      ],
      exhaustive: false,
    });
  });
});
