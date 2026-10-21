import type {
  DictionaryEntry,
  Evidence,
  LearningState,
  Skill,
} from "../domain";

/** One atomic state write for the single-device adapter. Remote writes require server transactions. */
export interface LearningRepository {
  load(): Promise<LearningState>;
  save(state: LearningState): Promise<void>;
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
