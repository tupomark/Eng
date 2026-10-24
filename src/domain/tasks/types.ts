/** Legacy skill identifiers retain their meaning; listening/pronunciation are additive. */
export const LEARNING_SKILLS = [
  "recognition",
  "context",
  "recall",
  "writing",
  "speaking",
  "listening",
  "pronunciation",
] as const;
export type LexicalSkill = (typeof LEARNING_SKILLS)[number];
export type TaskSkill = LexicalSkill | "grammar";
export type LearningTarget =
  { kind: "sense"; senseId: string } | { kind: "grammar"; conceptId: string };

export const TASK_FORMATS = [
  "recognition",
  "context-gap",
  "recall",
  "translation-to-en",
  "translation-from-en",
  "own-sentence",
  "listening-comprehension",
  "speech",
  "pronunciation",
  "grammar-choice",
] as const;
export type TaskFormat = (typeof TASK_FORMATS)[number];
export type TaskModality = "text" | "audio-input" | "audio-output";
export type EvaluatorCapability =
  "deterministic" | "semantic" | "speech" | "pronunciation";

export interface TaskProvenance {
  provider: string;
  version: string;
  rights: string;
  kind: "editorial" | "user" | "ai";
}

export interface TaskDefinition {
  id: string;
  version: string;
  target: LearningTarget;
  skill: TaskSkill;
  format: TaskFormat;
  promptFamily: string;
  prompt: string;
  /** Closed tasks only: the author explicitly warrants these alternatives. */
  acceptedAnswers: string[];
  partialAnswers?: string[];
  caseSensitive?: boolean;
  explanation: string;
  rubricVersion: string;
  evaluator: EvaluatorCapability;
  hints: { id: string; text: string }[];
  source: TaskProvenance;
  context?: { id: string; excerpt: string };
  /** Only a real playable source warrants an audio comprehension observation. */
  audioSourceId?: string;
  ambiguous?: boolean;
}

export interface AssistanceSnapshot {
  hintIds: string[];
  answerRevealedAt?: string;
  transcriptRevealedAt?: string;
  acceptedCorrection: boolean;
}

export type TaskOutcome = "accepted" | "partial" | "not-yet" | "uncertain";

export interface TaskEvaluation {
  outcome: TaskOutcome;
  explanation: string;
  rubricVersion: string;
  evaluator: "deterministic" | "provider";
  provider?: string;
  model?: string;
  /** Uncertainty, absent dependencies and technical failures produce no evidence. */
  reason?:
    | "ambiguous-prompt"
    | "evaluator-unavailable"
    | "provider-failure"
    | "answer-revealed";
}

export interface TaskAttempt {
  id: string;
  taskId: string;
  taskVersion: string;
  answer: string;
  startedAt: string;
  submittedAt?: string;
  status: "answering" | "submitted" | "evaluated" | "cancelled";
  assistance: AssistanceSnapshot;
  evaluation?: TaskEvaluation;
}

/** Evidence records observed behaviour, never an automatic mastery percentage. */
export interface TaskObservation {
  id: string;
  attemptId: string;
  taskId: string;
  taskVersion: string;
  target: LearningTarget;
  skill: TaskSkill;
  format: TaskFormat;
  outcome: Exclude<TaskOutcome, "uncertain">;
  occurredAt: string;
  assistance: AssistanceSnapshot;
  independent: boolean;
  modality: TaskModality;
  rubricVersion: string;
  evaluationSource: "deterministic" | "provider";
  provider?: string;
  model?: string;
  source: TaskProvenance;
}

export interface TaskChallenge {
  id: string;
  observationId: string;
  /** Missing on legacy challenges means learner initiated. */
  initiator?: "learner" | "assessment-policy";
  policyId?: string;
  challengedAt: string;
  reason: string;
}

export interface TaskCompetenceSummary {
  target: LearningTarget;
  skill: TaskSkill;
  /** Distinguish missing measurements from unsuccessful observed attempts. */
  status: "insufficient-data" | "observed";
  observations: number;
  independentObservations: number;
  accepted: number;
  partial: number;
  notYet: number;
  assisted: number;
  lastObservedAt: string | null;
  methodologyVersion: "task-observations-v1";
}
