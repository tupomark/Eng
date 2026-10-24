import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_PURGE_CONFIRMATION,
  previewLocalProfile,
  purgeLocalProfile,
  restartLocalProfile,
  type LocalProfileEnvironment,
  type PurgeKeyStore,
  type PurgeWorker,
} from "../../src/infrastructure/storage/local-profile-purge";
import { LOCAL_PURGE_MARKER } from "../../src/infrastructure/storage/preferences";

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
});
