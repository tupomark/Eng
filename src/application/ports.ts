import type {
  DictionaryEntry,
  Evidence,
  LearningState,
  Skill,
} from "../domain";

/**
 * Legacy async facade for the single-device snapshot format. This is not a
 * remote command contract: server writes will require authenticated commands
 * and transactions rather than replacement of a complete LearningState.
 */
export interface LearningRepository {
  load(): Promise<LearningState>;
  save(state: LearningState): Promise<void>;
}

export interface LearningSnapshot {
  readonly state: LearningState;
  /** Exact stored bytes, including null for an absent record. */
  readonly serialized: string | null;
}

/**
 * Synchronous local snapshot persistence. commit must throw on a failed write
 * or stale expected bytes and return the new bytes only after storage succeeds.
 * The browser adapter's stale snapshot check is best effort across tabs, not a
 * database transaction or an atomic compare-and-swap primitive.
 */
export interface SnapshotLearningRepository {
  read(): LearningSnapshot;
  commit(state: LearningState, expectedSerialized: string | null): string;
}

export interface DictionaryProvider {
  lookup(query: string, signal?: AbortSignal): Promise<DictionaryEntry | null>;
}

export interface AssessmentRequest {
  senseId: string;
  skill: Skill;
  answer: string;
  context?: string;
}

export interface AssessmentResult {
  provider: string;
  model: string;
  rubricVersion: string;
  explanation: string;
  confidence: number;
  /** A proposal for user confirmation, not an automatically trusted knowledge update. */
  proposedEvidence: Omit<Evidence, "source"> & { source: "ai-verification" };
}

export interface AssessmentProvider {
  assess(
    request: AssessmentRequest,
    signal?: AbortSignal,
  ): Promise<AssessmentResult>;
}

export interface SpeechResult {
  text: string;
  provider: string;
  /** Null means the provider did not supply a calibrated confidence. */
  confidence: number | null;
}

export interface SpeechProvider {
  transcribe(audio: Blob, signal?: AbortSignal): Promise<SpeechResult>;
  synthesize(text: string, signal?: AbortSignal): Promise<Blob>;
}
