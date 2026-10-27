import { describe, expect, it, vi } from "vitest";
import {
  ProfileRestoreCoordinator,
  ProfileRestoreError,
  type ProfileRestoreJournalPort,
  type ProfileRestorePlan,
  type ProfileRestoreProgress,
  type ProfileRestoreTargetPort,
} from "@/application/profile-recovery";
import type {
  ProfileRestoreMarker,
  ProfileRestorePayload,
  ProfileRestoreStep,
} from "@/domain/profile-recovery";

const HASH = {
  beforeA: "a".repeat(64),
  afterA: "b".repeat(64),
  beforeB: "c".repeat(64),
  afterB: "d".repeat(64),
  foreign: "e".repeat(64),
};

function plan(): ProfileRestorePlan {
  return {
    marker: {
      version: 1,
      id: "restore-original-id",
      owner: "local",
      fileHash: "f".repeat(64),
      epoch: "epoch-original-id",
      status: "staged",
      startedAt: "2026-10-26T10:00:00.000Z",
      updatedAt: "2026-10-26T10:00:00.000Z",
      steps: [
        {
          id: "local:learning",
          kind: "local",
          target: "lexis.learning.v1",
          beforeHash: HASH.beforeA,
          afterHash: HASH.afterA,
        },
        {
          id: "writing:local",
          kind: "writing",
          target: "local",
          beforeHash: HASH.beforeB,
          afterHash: HASH.afterB,
        },
      ],
      completed: [],
    },
    payloads: {
      "local:learning": { bytes: new Uint8Array([10, 20, 30]) },
      "writing:local": {
        bytes: new Uint8Array([40, 50, 60]),
        metadata: "private-staged-metadata",
      },
    },
  };
}

class Journal implements ProfileRestoreJournalPort {
  marker: ProfileRestoreMarker | null = null;
  payloads: Record<string, ProfileRestorePayload> = {};
  events: string[] = [];
  failReceiptOnce = false;
  failBeginAfterPublishing = false;
  failPause = false;

  private current(id: string): ProfileRestoreMarker {
    if (!this.marker || this.marker.id !== id) throw new Error("Missing job.");
    return structuredClone(this.marker);
  }

  async stage(
    marker: ProfileRestoreMarker,
    payloads: Record<string, ProfileRestorePayload>,
    options?: { onProgress?: (completed: number, total: number) => void },
  ): Promise<ProfileRestoreMarker> {
    this.events.push("stage");
    this.marker = structuredClone(marker);
    this.payloads = structuredClone(payloads);
    options?.onProgress?.(marker.steps.length, marker.steps.length);
    return this.current(marker.id);
  }
  async load(id: string): Promise<ProfileRestoreMarker | null> {
    return this.marker?.id === id ? this.current(id) : null;
  }
  async payload(
    id: string,
    stepId: string,
  ): Promise<ProfileRestorePayload | null> {
    this.current(id);
    this.events.push(`payload:${stepId}`);
    return this.payloads[stepId] ?? null;
  }
  async begin(id: string): Promise<ProfileRestoreMarker> {
    this.marker = { ...this.current(id), status: "running" };
    this.events.push("begin");
    if (this.failBeginAfterPublishing) throw new Error("Journal unavailable.");
    return this.current(id);
  }
  async receipt(id: string, stepId: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    if (this.failReceiptOnce) {
      this.failReceiptOnce = false;
      throw new Error("Receipt write failed after target commit.");
    }
    if (!marker.completed.includes(stepId)) marker.completed.push(stepId);
    this.marker = marker;
    this.events.push(`receipt:${stepId}`);
    return this.current(id);
  }
  async pause(id: string, failedStep?: string): Promise<ProfileRestoreMarker> {
    if (this.failPause) throw new Error("Journal storage denied.");
    this.marker = {
      ...this.current(id),
      status: "partial",
      ...(failedStep ? { failedStep } : {}),
    };
    this.events.push("pause");
    return this.current(id);
  }
  async complete(id: string): Promise<ProfileRestoreMarker> {
    this.marker = { ...this.current(id), status: "complete" };
    this.events.push("complete");
    return this.current(id);
  }
  async cancelBeforeWrites(id: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    if (marker.status !== "staged")
      throw new Error("Cannot blindly roll back.");
    this.marker = { ...marker, status: "cancelled" };
    return this.current(id);
  }
  async acceptPartial(id: string): Promise<ProfileRestoreMarker> {
    const marker = this.current(id);
    if (marker.status !== "partial") throw new Error("Not paused.");
    this.marker = { ...marker, status: "partial-accepted" };
    return this.current(id);
  }
  async releaseFinished(id: string): Promise<void> {
    const marker = this.current(id);
    if (
      !["complete", "cancelled", "partial-accepted"].includes(marker.status)
    ) {
      throw new Error("Still active.");
    }
    this.marker = null;
    this.payloads = {};
  }
}

function fixture() {
  const journal = new Journal();
  const values = new Map<string, string | null>([
    ["local:learning", HASH.beforeA],
    ["writing:local", HASH.beforeB],
  ]);
  const writes: string[] = [];
  const readCurrentHash = vi.fn(async (step: ProfileRestoreStep) => {
    journal.events.push(`read:${step.id}`);
    return values.get(step.id) ?? null;
  });
  const apply = vi.fn(
    async (
      step: ProfileRestoreStep,
      _payload: ProfileRestorePayload,
      operationId: string,
    ) => {
      if (journal.marker?.id !== operationId)
        throw new Error("Wrong operation.");
      if (values.get(step.id) !== step.beforeHash)
        throw new Error("CAS conflict.");
      writes.push(step.id);
      journal.events.push(`write:${step.id}`);
      values.set(step.id, step.afterHash);
    },
  );
  const targets: ProfileRestoreTargetPort = { readCurrentHash, apply };
  const prepare = vi.fn(async () => {
    journal.events.push("prepare");
  });
  const coordinator = new ProfileRestoreCoordinator({
    journal,
    targets,
    prepare,
  });
  return {
    journal,
    values,
    writes,
    targets,
    prepare,
    coordinator,
    readCurrentHash,
    apply,
  };
}

describe("cross-store local profile recovery", () => {
  it("prepares and stages before any target write, checks the whole plan, then confirms all final values", async () => {
    const f = fixture();
    const progress: ProfileRestoreProgress[] = [];
    const result = await f.coordinator.start(plan(), {
      onProgress: (item) => progress.push(item),
    });
    expect(result.status).toBe("complete");
    expect(result.id).toBe("restore-original-id");
    expect(result.completed).toEqual(["local:learning", "writing:local"]);
    expect(f.writes).toEqual(["local:learning", "writing:local"]);
    expect(f.journal.events.slice(0, 3)).toEqual(["prepare", "stage", "begin"]);
    expect(f.journal.events.indexOf("read:writing:local")).toBeLessThan(
      f.journal.events.indexOf("write:local:learning"),
    );
    expect(progress.at(-1)).toEqual({
      phase: "complete",
      completed: 2,
      total: 2,
    });
    expect(progress.filter((item) => item.phase === "verifying")).toHaveLength(
      2,
    );
    // Completion retains the safety marker; reopening requires an explicit separate action.
    expect(f.journal.marker?.status).toBe("complete");
    await f.coordinator.releaseFinished(result.id);
    expect(f.journal.marker).toBeNull();
  });

  it("does not stage or write when unsaved work prevents preparation", async () => {
    const f = fixture();
    f.prepare.mockRejectedValueOnce(new Error("An unsaved private paragraph."));
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "preparation",
    });
    expect(f.journal.marker).toBeNull();
    expect(f.writes).toEqual([]);
    expect(f.journal.events).not.toContain("stage");
  });

  it("rejects an invalid unapplied plan before stopping any ongoing work", async () => {
    const f = fixture();
    const invalid = plan();
    delete invalid.payloads["writing:local"];
    await expect(f.coordinator.start(invalid)).rejects.toMatchObject({
      code: "staging",
    });
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
  });

  it("finds a conflict in the last selected target before writing the first target", async () => {
    const f = fixture();
    f.values.set("writing:local", HASH.foreign);
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "conflict",
      stepId: "writing:local",
    });
    expect(f.writes).toEqual([]);
    expect(f.journal.marker?.status).toBe("partial");
    expect(f.values.get("local:learning")).toBe(HASH.beforeA);
    expect(f.values.get("writing:local")).toBe(HASH.foreign);
  });

  it("checks every staged payload before the first target write", async () => {
    const f = fixture();
    f.targets.verifyPayload = vi.fn(async (step) => {
      if (step.id === "writing:local") throw new Error("Invalid late payload.");
    });
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "unavailable",
      stepId: "writing:local",
    });
    expect(f.writes).toEqual([]);
    expect(f.journal.marker?.status).toBe("partial");
  });

  it("resumes after a target commit with a lost receipt without applying that target twice", async () => {
    const f = fixture();
    f.journal.failReceiptOnce = true;
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "journal",
    });
    expect(f.journal.marker?.status).toBe("partial");
    expect(f.journal.marker?.completed).toEqual([]);
    expect(f.values.get("local:learning")).toBe(HASH.afterA);
    expect(f.values.get("writing:local")).toBe(HASH.beforeB);
    const reloaded = new ProfileRestoreCoordinator({
      journal: f.journal,
      targets: f.targets,
      prepare: f.prepare,
    });
    const result = await reloaded.resume("restore-original-id");
    expect(result.status).toBe("complete");
    expect(result.completed).toEqual(["local:learning", "writing:local"]);
    expect(f.writes).toEqual(["local:learning", "writing:local"]);
    expect(result.epoch).toBe("epoch-original-id");
  });

  it("keeps committed data when a write throws after commit, then confirms it on resume", async () => {
    const f = fixture();
    const realApply = f.apply.getMockImplementation()!;
    f.apply.mockImplementationOnce(async (...args) => {
      await realApply(...args);
      throw new Error("Connection lost after commit.");
    });
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "write",
    });
    expect(f.journal.marker?.completed).toEqual([]);
    expect(f.values.get("local:learning")).toBe(HASH.afterA);
    await f.coordinator.resume("restore-original-id");
    expect(f.writes).toEqual(["local:learning", "writing:local"]);
  });

  it("does not rewrite a receipted target if its data no longer match the confirmed value", async () => {
    const f = fixture();
    await f.journal.stage(plan().marker, plan().payloads);
    f.journal.marker = {
      ...f.journal.marker!,
      status: "partial",
      completed: ["local:learning"],
    };
    // Reversion to the old before-hash is still a conflict for an already receipted step.
    await expect(
      f.coordinator.resume("restore-original-id"),
    ).rejects.toMatchObject({
      code: "conflict",
    });
    expect(f.writes).toEqual([]);
    expect(f.values.get("local:learning")).toBe(HASH.beforeA);
  });

  it("does not mark a successful API return complete until readback matches the planned hash", async () => {
    const f = fixture();
    f.apply.mockImplementationOnce(async () => {});
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "verification",
      stepId: "local:learning",
    });
    expect(f.journal.marker?.status).toBe("partial");
    expect(f.journal.marker?.completed).toEqual([]);
    expect(f.journal.events).not.toContain("complete");
  });

  it("detects a conflict introduced after global preflight at the write boundary", async () => {
    const f = fixture();
    let count = 0;
    f.readCurrentHash.mockImplementation(async (step) => {
      count++;
      if (count === 3) f.values.set("local:learning", HASH.foreign);
      return f.values.get(step.id) ?? null;
    });
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "conflict",
    });
    expect(f.writes).toEqual([]);
    expect(f.values.get("local:learning")).toBe(HASH.foreign);
  });

  it("rechecks all selected targets after the last receipt", async () => {
    const f = fixture();
    const realReceipt = f.journal.receipt.bind(f.journal);
    vi.spyOn(f.journal, "receipt").mockImplementation(async (id, stepId) => {
      const marker = await realReceipt(id, stepId);
      if (stepId === "writing:local")
        f.values.set("local:learning", HASH.foreign);
      return marker;
    });
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "verification",
      stepId: "local:learning",
    });
    expect(f.journal.marker?.completed).toHaveLength(2);
    expect(f.journal.marker?.status).toBe("partial");
    expect(f.journal.events).not.toContain("complete");
  });

  it("stops at cancellation after a confirmed step and resumes the same operation", async () => {
    const f = fixture();
    const abort = new AbortController();
    await expect(
      f.coordinator.start(plan(), {
        signal: abort.signal,
        onProgress: (progress) => {
          if (progress.phase === "applying" && progress.completed === 1)
            abort.abort();
        },
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(f.writes).toEqual(["local:learning"]);
    expect(f.journal.marker?.completed).toEqual(["local:learning"]);
    expect(f.journal.marker?.status).toBe("partial");
    await f.coordinator.resume("restore-original-id");
    expect(f.writes).toEqual(["local:learning", "writing:local"]);
  });

  it("does not publish a marker for an already cancelled request", async () => {
    const f = fixture();
    const abort = new AbortController();
    abort.abort();
    await expect(
      f.coordinator.start(plan(), { signal: abort.signal }),
    ).rejects.toMatchObject({
      code: "cancelled",
    });
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.journal.marker).toBeNull();
  });

  it("pauses a begin that published running state before its response failed", async () => {
    const f = fixture();
    f.journal.failBeginAfterPublishing = true;
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "journal",
    });
    expect(f.journal.marker?.status).toBe("partial");
    expect(f.writes).toEqual([]);
  });

  it("keeps a durable running marker when recording a pause is itself unavailable", async () => {
    const f = fixture();
    f.journal.failReceiptOnce = true;
    f.journal.failPause = true;
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "journal",
    });
    expect(f.journal.marker?.status).toBe("running");
    expect(f.values.get("local:learning")).toBe(HASH.afterA);
    f.journal.failPause = false;
    await f.coordinator.resume("restore-original-id");
    expect(f.writes).toEqual(["local:learning", "writing:local"]);
  });

  it("does not call the target port when a staged payload has been evicted", async () => {
    const f = fixture();
    await f.journal.stage(plan().marker, plan().payloads);
    delete f.journal.payloads["writing:local"];
    await expect(
      f.coordinator.resume("restore-original-id"),
    ).rejects.toMatchObject({
      code: "unavailable",
      stepId: "writing:local",
    });
    expect(f.writes).toEqual([]);
    expect(f.journal.marker?.status).toBe("partial");
  });

  it("never leaks private adapter errors in the safe application error", async () => {
    const f = fixture();
    f.apply.mockRejectedValueOnce(
      new Error("private-book-text credential=secret"),
    );
    const error = await f.coordinator
      .start(plan())
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ProfileRestoreError);
    expect(String(error)).not.toContain("private-book-text");
    expect(JSON.stringify(error)).not.toContain("secret");
  });

  it("serializes actions within one coordinator and tolerates a faulty progress observer", async () => {
    const f = fixture();
    let release!: () => void;
    f.prepare.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = f.coordinator.start(plan(), {
      onProgress: () => {
        throw new Error("Rendering failed.");
      },
    });
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "busy",
    });
    await expect(
      f.coordinator.acceptPartial("restore-original-id"),
    ).rejects.toMatchObject({ code: "busy" });
    release();
    expect((await first).status).toBe("complete");
  });

  it("distinguishes accepting a partial result from successful full recovery", async () => {
    const f = fixture();
    f.journal.failReceiptOnce = true;
    await expect(f.coordinator.start(plan())).rejects.toMatchObject({
      code: "journal",
    });
    await expect(
      f.coordinator.cancelBeforeWrites("restore-original-id"),
    ).rejects.toThrow();
    const accepted = await f.coordinator.acceptPartial("restore-original-id");
    expect(accepted.status).toBe("partial-accepted");
    expect(accepted.completed).toEqual([]);
    expect(f.values.get("local:learning")).toBe(HASH.afterA);
    expect(f.values.get("writing:local")).toBe(HASH.beforeB);
    await f.coordinator.releaseFinished("restore-original-id");
    expect(f.journal.marker).toBeNull();
  });

  it("can cancel a staged plan without target writes but requires explicit reopen", async () => {
    const f = fixture();
    await f.journal.stage(plan().marker, plan().payloads);
    const cancelled = await f.coordinator.cancelBeforeWrites(
      "restore-original-id",
    );
    expect(cancelled.status).toBe("cancelled");
    expect(f.writes).toEqual([]);
    expect(f.journal.marker?.status).toBe("cancelled");
    await f.coordinator.releaseFinished(cancelled.id);
    expect(f.journal.marker).toBeNull();
  });
});
