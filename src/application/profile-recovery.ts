import {
  parseProfileRestoreMarker,
  type ProfileRestoreMarker,
  type ProfileRestorePayload,
  type ProfileRestoreStep,
} from "@/domain/profile-recovery";

export interface ProfileRestorePlan {
  marker: ProfileRestoreMarker;
  payloads: Record<string, ProfileRestorePayload>;
}

export interface ProfileRestoreJournalPort {
  stage(
    marker: ProfileRestoreMarker,
    payloads: Record<string, ProfileRestorePayload>,
    options?: {
      signal?: AbortSignal;
      onProgress?: (completed: number, total: number) => void;
    },
  ): Promise<ProfileRestoreMarker>;
  load(id: string): Promise<ProfileRestoreMarker | null>;
  payload(id: string, stepId: string): Promise<ProfileRestorePayload | null>;
  begin(id: string): Promise<ProfileRestoreMarker>;
  receipt(id: string, stepId: string): Promise<ProfileRestoreMarker>;
  pause(id: string, failedStep?: string): Promise<ProfileRestoreMarker>;
  complete(id: string): Promise<ProfileRestoreMarker>;
  cancelBeforeWrites(id: string): Promise<ProfileRestoreMarker>;
  acceptPartial(id: string): Promise<ProfileRestoreMarker>;
  releaseFinished(id: string): Promise<void>;
}

export interface ProfileRestoreTargetPort {
  /** Hashes canonical target data, or returns null only when the target is absent. */
  readCurrentHash(step: ProfileRestoreStep): Promise<string | null>;
  /** Must perform its own operation authorization and compare-and-set at the store boundary. */
  apply(
    step: ProfileRestoreStep,
    payload: ProfileRestorePayload,
    operationId: string,
  ): Promise<void>;
  /** Optional semantic validation; every selected payload is checked before the first target write. */
  verifyPayload?(
    step: ProfileRestoreStep,
    payload: ProfileRestorePayload,
  ): Promise<void>;
}

export interface ProfileRestoreProgress {
  phase:
    | "preparing"
    | "staging"
    | "checking"
    | "applying"
    | "verifying"
    | "complete";
  completed: number;
  total: number;
  stepId?: string;
}

export interface ProfileRestoreOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ProfileRestoreProgress) => void;
}

export type ProfileRestoreErrorCode =
  | "busy"
  | "cancelled"
  | "preparation"
  | "staging"
  | "unavailable"
  | "conflict"
  | "write"
  | "verification"
  | "journal";

const ERROR_MESSAGES: Record<ProfileRestoreErrorCode, string> = {
  busy: "Another profile recovery action is still running. Wait for it to finish or cancel it before retrying.",
  cancelled:
    "Profile recovery was stopped. Existing and already applied data remain saved; reopen recovery to inspect or resume its recorded progress.",
  preparation:
    "Profile recovery could not pause ongoing work. Save or copy any unsaved text in the other LEXIS tabs, then retry. No recovery step was applied.",
  staging:
    "Recovery data could not be prepared on this device. No selected recovery step was applied. Keep the backup file and check the recorded recovery state before retrying.",
  unavailable:
    "Saved recovery data is missing or unreadable. Keep the original backup file. Already applied data remain saved, and no further recovery step was applied.",
  conflict:
    "The local profile changed after this recovery preview. No conflicting data were overwritten. Inspect the recorded progress before resuming or keeping the partial result.",
  write:
    "A recovery step could not be confirmed. Some data may already be saved. Resume the recorded operation so confirmed data are checked before another write.",
  verification:
    "Recovered data did not match the selected plan. Recovery is not complete. Keep the original backup and inspect the recorded progress before continuing.",
  journal:
    "Recovery progress could not be recorded. Existing and already applied data remain saved. Reopen recovery before continuing; do not start a replacement operation.",
};

/** Deliberately omits adapter errors, which may contain private text or persisted bytes. */
export class ProfileRestoreError extends Error {
  constructor(
    readonly code: ProfileRestoreErrorCode,
    readonly operationId?: string,
    readonly stepId?: string,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "ProfileRestoreError";
  }
}

export interface ProfileRestoreCoordinatorDependencies {
  journal: ProfileRestoreJournalPort;
  targets: ProfileRestoreTargetPort;
  /** Stops resources and rejects unsaved-work conflicts, without publishing a restore marker. */
  prepare(): Promise<void>;
}

/**
 * A resumable sequence across separate stores, not a cross-store transaction.
 * Every target is checked before the first write and again at its own boundary.
 */
export class ProfileRestoreCoordinator {
  private busy = false;

  constructor(
    private readonly dependencies: ProfileRestoreCoordinatorDependencies,
  ) {}

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.busy) throw new ProfileRestoreError("busy");
    this.busy = true;
    try {
      return await action();
    } finally {
      this.busy = false;
    }
  }

  private assertNotCancelled(options: ProfileRestoreOptions, id: string): void {
    if (options.signal?.aborted) throw new ProfileRestoreError("cancelled", id);
  }

  private progress(
    options: ProfileRestoreOptions,
    progress: ProfileRestoreProgress,
  ): void {
    // Rendering/diagnostic observers cannot change the outcome of a persisted operation.
    try {
      options.onProgress?.(progress);
    } catch {}
  }

  private async prepare(
    id: string,
    total: number,
    options: ProfileRestoreOptions,
  ): Promise<void> {
    this.assertNotCancelled(options, id);
    this.progress(options, { phase: "preparing", completed: 0, total });
    try {
      await this.dependencies.prepare();
    } catch {
      throw new ProfileRestoreError("preparation", id);
    }
    this.assertNotCancelled(options, id);
  }

  start(
    plan: ProfileRestorePlan,
    options: ProfileRestoreOptions = {},
  ): Promise<ProfileRestoreMarker> {
    return this.exclusive(async () => {
      let marker: ProfileRestoreMarker;
      try {
        marker = parseProfileRestoreMarker(plan.marker);
        if (
          marker.status !== "staged" ||
          marker.completed.length ||
          marker.failedStep ||
          Object.keys(plan.payloads).length !== marker.steps.length ||
          marker.steps.some(
            (step) =>
              !Object.hasOwn(plan.payloads, step.id) ||
              !(plan.payloads[step.id]?.bytes instanceof Uint8Array),
          )
        ) {
          throw new Error("Invalid unapplied plan.");
        }
      } catch {
        throw new ProfileRestoreError("staging");
      }
      await this.prepare(marker.id, marker.steps.length, options);
      this.progress(options, {
        phase: "staging",
        completed: 0,
        total: marker.steps.length,
      });
      try {
        marker = await this.dependencies.journal.stage(marker, plan.payloads, {
          signal: options.signal,
          onProgress: (completed, total) =>
            this.progress(options, { phase: "staging", completed, total }),
        });
      } catch {
        throw new ProfileRestoreError(
          options.signal?.aborted ? "cancelled" : "staging",
          marker.id,
        );
      }
      return this.run(marker, options);
    });
  }

  resume(
    id: string,
    options: ProfileRestoreOptions = {},
  ): Promise<ProfileRestoreMarker> {
    return this.exclusive(async () => {
      let marker: ProfileRestoreMarker | null;
      try {
        marker = await this.dependencies.journal.load(id);
      } catch {
        throw new ProfileRestoreError("journal", id);
      }
      if (
        !marker ||
        !["staged", "running", "partial"].includes(marker.status)
      ) {
        throw new ProfileRestoreError("unavailable", id);
      }
      await this.prepare(marker.id, marker.steps.length, options);
      return this.run(marker, options);
    });
  }

  private async run(
    staged: ProfileRestoreMarker,
    options: ProfileRestoreOptions,
  ): Promise<ProfileRestoreMarker> {
    const { journal, targets } = this.dependencies;
    const id = staged.id;
    let stepId: string | undefined;
    let code: ProfileRestoreErrorCode = "journal";
    try {
      this.assertNotCancelled(options, id);
      let marker = await journal.begin(id);
      const completed = new Set(marker.completed);
      const total = marker.steps.length;
      code = "unavailable";
      // Read each bounded payload independently: journal integrity and optional semantic
      // validation must succeed for the whole plan before any live target is changed.
      for (const [index, step] of marker.steps.entries()) {
        stepId = step.id;
        this.assertNotCancelled(options, id);
        const payload = await journal.payload(id, step.id);
        if (!payload) throw new ProfileRestoreError("unavailable", id, step.id);
        await targets.verifyPayload?.(step, payload);
        code = "conflict";
        const current = await targets.readCurrentHash(step);
        if (
          current !== step.afterHash &&
          (completed.has(step.id) || current !== step.beforeHash)
        ) {
          throw new ProfileRestoreError("conflict", id, step.id);
        }
        this.progress(options, {
          phase: "checking",
          completed: index + 1,
          total,
          stepId: step.id,
        });
        code = "unavailable";
      }
      for (const [index, step] of marker.steps.entries()) {
        stepId = step.id;
        this.assertNotCancelled(options, id);
        code = "conflict";
        const current = await targets.readCurrentHash(step);
        if (current !== step.afterHash) {
          if (completed.has(step.id) || current !== step.beforeHash) {
            throw new ProfileRestoreError("conflict", id, step.id);
          }
          code = "unavailable";
          const payload = await journal.payload(id, step.id);
          if (!payload)
            throw new ProfileRestoreError("unavailable", id, step.id);
          this.assertNotCancelled(options, id);
          code = "write";
          await targets.apply(step, payload, id);
          code = "verification";
          if ((await targets.readCurrentHash(step)) !== step.afterHash) {
            throw new ProfileRestoreError("verification", id, step.id);
          }
        }
        // A write may have committed before its receipt failed. Exact after-hash
        // means recording the receipt again is safe; applying the payload again is unnecessary.
        code = "journal";
        marker = await journal.receipt(id, step.id);
        completed.add(step.id);
        this.progress(options, {
          phase: "applying",
          completed: index + 1,
          total,
          stepId: step.id,
        });
      }
      code = "verification";
      for (const [index, step] of marker.steps.entries()) {
        stepId = step.id;
        this.assertNotCancelled(options, id);
        if ((await targets.readCurrentHash(step)) !== step.afterHash) {
          throw new ProfileRestoreError("verification", id, step.id);
        }
        this.progress(options, {
          phase: "verifying",
          completed: index + 1,
          total,
          stepId: step.id,
        });
      }
      this.assertNotCancelled(options, id);
      code = "journal";
      marker = await journal.complete(id);
      this.progress(options, { phase: "complete", completed: total, total });
      return marker;
    } catch (cause) {
      // Never claim rollback: a target may have committed before a receipt failed.
      // Even a failed begin can have published its epoch/status before throwing.
      try {
        const latest = await journal.load(id);
        if (latest?.status === "running" || latest?.status === "partial") {
          await journal.pause(id, stepId);
        }
      } catch {
        // An unavailable journal remains locked at its last durable marker.
      }
      if (cause instanceof ProfileRestoreError) throw cause;
      throw new ProfileRestoreError(
        options.signal?.aborted ? "cancelled" : code,
        id,
        stepId,
      );
    }
  }

  cancelBeforeWrites(id: string): Promise<ProfileRestoreMarker> {
    return this.control(id, () =>
      this.dependencies.journal.cancelBeforeWrites(id),
    );
  }

  acceptPartial(id: string): Promise<ProfileRestoreMarker> {
    return this.control(id, () => this.dependencies.journal.acceptPartial(id));
  }

  releaseFinished(id: string): Promise<void> {
    return this.control(id, () =>
      this.dependencies.journal.releaseFinished(id),
    );
  }

  private control<T>(id: string, action: () => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      try {
        return await action();
      } catch {
        throw new ProfileRestoreError("journal", id);
      }
    });
  }
}
