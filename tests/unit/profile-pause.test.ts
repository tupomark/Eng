import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function browser() {
  const disk = new Map<string, string>();
  const storage = {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => disk.set(key, value),
    removeItem: (key: string) => disk.delete(key),
  };
  const events = Object.assign(new EventTarget(), { localStorage: storage });
  vi.stubGlobal("window", events);
  vi.stubGlobal("BroadcastChannel", undefined);
  return { disk, storage, events };
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("profile recovery workspace pause", () => {
  it("checks every workspace before cleanup and does not publish a marker or suspend staging", async () => {
    const { storage } = browser();
    const events: string[] = [];
    const pause = await import("@/infrastructure/materials/purge-signal");
    const guard = await import("@/infrastructure/storage/local-write-guard");
    const first = pause.subscribeToProfileRestore(
      async () => {
        events.push("first-stop");
      },
      () => {
        events.push("first-check");
      },
    );
    const second = pause.subscribeToProfileRestore(
      () => {
        events.push("second-stop");
      },
      () => {
        events.push("second-check");
      },
    );
    await pause.prepareBrowserProfileRestore();
    expect(events).toEqual([
      "first-check",
      "second-check",
      "first-stop",
      "second-stop",
    ]);
    expect(pause.localPurgePending()).toBe(true);
    expect(() => pause.assertLocalWritesAllowed()).toThrow(/profile operation/);
    expect(() => guard.assertLocalWritesAllowed(storage)).not.toThrow();
    expect(storage.getItem("lexis.profile-restore.v1")).toBeNull();
    first();
    second();
  });

  it("rejects unsaved input before any cleanup and preserves writable source stores", async () => {
    const { storage } = browser();
    storage.setItem("lexis.learning.v1", "original");
    const pause = await import("@/infrastructure/materials/purge-signal");
    const stopped = vi.fn();
    const first = pause.subscribeToProfileRestore(stopped);
    const second = pause.subscribeToProfileRestore(stopped, () => {
      throw new Error("Copy unsaved writing before recovery.");
    });
    await expect(pause.prepareBrowserProfileRestore()).rejects.toThrow(
      /unsaved writing/,
    );
    expect(stopped).not.toHaveBeenCalled();
    expect(pause.localPurgePending()).toBe(false);
    expect(storage.getItem("lexis.learning.v1")).toBe("original");
    expect(() => pause.assertLocalWritesAllowed()).not.toThrow();
    first();
    second();
  });

  it("awaits async cleanup without invoking destructive purge handlers", async () => {
    browser();
    const pause = await import("@/infrastructure/materials/purge-signal");
    const destructive = vi.fn();
    const first = pause.subscribeToLocalPurge(destructive);
    let finish: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const second = pause.subscribeToProfileRestore(() => done);
    let completed = false;
    const preparation = pause.prepareBrowserProfileRestore().then(() => {
      completed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).toBe(false);
    finish!();
    await preparation;
    expect(completed).toBe(true);
    expect(destructive).not.toHaveBeenCalled();
    first();
    second();
  });

  it("bounds hanging cleanup and keeps the mounted page paused after failure", async () => {
    browser();
    vi.useFakeTimers();
    const pause = await import("@/infrastructure/materials/purge-signal");
    const release = pause.subscribeToProfileRestore(
      () => new Promise(() => {}),
    );
    const result = expect(pause.prepareBrowserProfileRestore()).rejects.toThrow(
      /did not pause in time/,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(pause.localPurgePending()).toBe(true);
    release();
  });

  it("forces cleanup on a durable marker even when the stale tab has unsaved input", async () => {
    const { storage, events } = browser();
    storage.setItem("lexis.profile-restore.v1", "retained operation");
    const pause = await import("@/infrastructure/materials/purge-signal");
    const stopped = vi.fn();
    const validate = vi.fn(() => {
      throw new Error("unsaved");
    });
    const release = pause.subscribeToProfileRestore(stopped, validate);
    await Promise.resolve();
    expect(stopped).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
    events.dispatchEvent(
      new CustomEvent("lexis-profile-restore", {
        detail: { id: "retained operation", status: "running" },
      }),
    );
    await Promise.resolve();
    expect(stopped).toHaveBeenCalledTimes(2);
    expect(validate).not.toHaveBeenCalled();
    storage.removeItem("lexis.profile-restore.v1");
    expect(pause.localPurgePending()).toBe(true);
    release();
  });

  it("keeps a stale page paused after epoch notification and marker release", async () => {
    const { storage, events } = browser();
    const pause = await import("@/infrastructure/materials/purge-signal");
    const stopped = vi.fn();
    const release = pause.subscribeToProfileRestore(stopped);
    storage.setItem("lexis.profile-epoch.v1", "new profile epoch");
    events.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: "lexis.profile-epoch.v1",
        oldValue: null,
        newValue: "new profile epoch",
      }),
    );
    await Promise.resolve();
    expect(stopped).toHaveBeenCalledOnce();
    expect(pause.localPurgePending()).toBe(true);
    release();
  });

  it("continues to protect explicit deletion without invoking restore checks", async () => {
    const { events } = browser();
    const pause = await import("@/infrastructure/materials/purge-signal");
    const deleted = vi.fn();
    const first = pause.subscribeToLocalPurge(deleted);
    const check = vi.fn();
    const second = pause.subscribeToProfileRestore(vi.fn(), check);
    const pending: Promise<unknown>[] = [];
    events.dispatchEvent(
      new CustomEvent("lexis-local-purge", {
        detail: {
          register: (item: Promise<unknown>) => pending.push(item),
        },
      }),
    );
    await Promise.all(pending);
    expect(deleted).toHaveBeenCalledOnce();
    expect(check).not.toHaveBeenCalled();
    first();
    second();
  });

  it("rejects an acknowledged peer's unsaved input without stopping either workspace", async () => {
    const firstWindow = browser();
    const channels = new Set<CooperativeChannel>();
    class CooperativeChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      constructor(readonly name: string) {
        channels.add(this);
      }
      postMessage(data: unknown) {
        for (const target of channels)
          if (target !== this && target.name === this.name)
            queueMicrotask(() => {
              if (channels.has(target)) target.onmessage?.({ data });
            });
      }
      close() {
        channels.delete(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", CooperativeChannel);
    const firstModule = await import("@/infrastructure/materials/purge-signal");
    const peerStopped = vi.fn();
    const releasePeer = firstModule.subscribeToProfileRestore(
      peerStopped,
      () => {
        throw new Error("Unsaved peer writing");
      },
    );
    vi.resetModules();
    const secondWindow = Object.assign(new EventTarget(), {
      localStorage: firstWindow.storage,
    });
    vi.stubGlobal("window", secondWindow);
    const secondModule =
      await import("@/infrastructure/materials/purge-signal");
    const localStopped = vi.fn();
    const releaseLocal = secondModule.subscribeToProfileRestore(localStopped);
    await expect(secondModule.prepareBrowserProfileRestore()).rejects.toThrow(
      /Another workspace has unsaved input/,
    );
    expect(peerStopped).not.toHaveBeenCalled();
    expect(localStopped).not.toHaveBeenCalled();
    expect(secondModule.localPurgePending()).toBe(false);
    releaseLocal();
    vi.stubGlobal("window", firstWindow.events);
    releasePeer();
    expect(channels.size).toBe(0);
  });

  it("blocks Tutor read/mutation after a restore marker while preserving raw export", async () => {
    const { storage } = browser();
    const { BrowserTutorRepository } =
      await import("@/infrastructure/ai/browser-conversations");
    const tutor = new BrowserTutorRepository(storage, "local", "session-1");
    const original = tutor.load();
    tutor.commit(original);
    const raw = tutor.exportRaw();
    storage.setItem("lexis.profile-restore.v1", "retained operation");
    expect(() => tutor.load()).toThrow(/recovery has paused/);
    expect(() => tutor.commit(original)).toThrow(/recovery has paused/);
    expect(() => tutor.reset(true)).toThrow(/recovery has paused/);
    expect(tutor.exportRaw()).toBe(raw);
    storage.removeItem("lexis.profile-restore.v1");
    expect(() => tutor.commit(original)).toThrow(/recovery has paused/);
  });
});
