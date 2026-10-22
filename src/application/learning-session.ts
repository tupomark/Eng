import {
  disputeEvidence,
  parseLearningState,
  removeSavedSense,
  reviewSense,
  saveSense,
  type ClockInput,
  type LearningState,
  type Rating,
} from "../domain";
import type { LearningSnapshot, SnapshotLearningRepository } from "./ports";

export interface LearningSessionOptions {
  now: () => ClockInput;
  createId: () => string;
}

/**
 * Coordinates a single-device learning session independently of React and
 * browser APIs. The last good snapshot is published only after a successful
 * read or commit; storage errors never become successful in-memory changes.
 */
export class LearningSession {
  private snapshot: LearningSnapshot | undefined;
  private readable = false;

  constructor(
    private readonly repository: SnapshotLearningRepository,
    private readonly options: LearningSessionOptions,
  ) {}

  /** Last successfully loaded/committed state; callers must treat it as immutable. */
  get state(): LearningState | undefined {
    return this.snapshot?.state;
  }

  /** Also used after a storage event to reload a different tab's snapshot. */
  load(): LearningState {
    try {
      const loaded = this.repository.read();
      const state = parseLearningState(loaded.state);
      this.snapshot = { state, serialized: loaded.serialized };
      this.readable = true;
      return state;
    } catch (error) {
      // Keep the prior display state, but never overwrite unreadable durable data.
      this.readable = false;
      throw error;
    }
  }

  saveMeaning(senseId: string, context: string): LearningState {
    return this.commit((state) =>
      saveSense(state, senseId, context, this.options.now()),
    );
  }

  recordReview(
    senseId: string,
    rating: Rating,
    eventId?: string,
  ): LearningState {
    return this.commit((state) =>
      reviewSense(
        state,
        senseId,
        rating,
        this.options.now(),
        eventId ?? this.options.createId(),
      ),
    );
  }

  dispute(evidenceId: string): LearningState {
    return this.commit((state) =>
      disputeEvidence(state, evidenceId, this.options.now()),
    );
  }

  updateReaderProgress(percent: number): LearningState {
    return this.commit((state) => {
      if (!Number.isFinite(percent))
        throw new Error("Reader progress must be a finite number.");
      return {
        ...state,
        readerProgress: Math.min(100, Math.max(0, percent)),
      };
    });
  }

  /** A fresh save can be undone; any evidence, including disputes, prevents it. */
  undoSave(senseId: string): LearningState {
    return this.commit((state) => removeSavedSense(state, senseId));
  }

  private commit(
    update: (state: LearningState) => LearningState,
  ): LearningState {
    if (!this.snapshot || !this.readable)
      throw new Error(
        "Open or reload your local learning data before making changes. Unreadable data has been kept intact.",
      );
    const next = update(this.snapshot.state);
    const serialized = this.repository.commit(next, this.snapshot.serialized);
    this.snapshot = { state: next, serialized };
    return next;
  }
}
