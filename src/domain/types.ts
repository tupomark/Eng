/** Skill estimates are independent: an exercise never transfers credit implicitly. */
export const SKILLS = [
  "recognition",
  "context",
  "recall",
  "writing",
  "speaking",
] as const;
export type Skill = (typeof SKILLS)[number];

export const RATINGS = ["again", "hard", "good", "easy"] as const;
export type Rating = (typeof RATINGS)[number];

export interface Lexeme {
  id: string;
  lemma: string;
  ipa: string;
  partOfSpeech: string;
}

export interface Sense {
  id: string;
  lexemeId: string;
  definition: string;
  translation: string;
  example: string;
  collocations: string[];
}

export interface DictionaryEntry {
  lexeme: Lexeme;
  senses: Sense[];
}

export interface SavedSense {
  senseId: string;
  /** A bounded excerpt, never an entire imported document. */
  context: string;
  savedAt: string;
}

export interface Evidence {
  id: string;
  senseId: string;
  skill: Skill;
  rating: Rating;
  occurredAt: string;
  source: "self-review";
  /** Disputes retain the audit trail while excluding the observation from estimates. */
  disputedAt?: string;
}

export interface SkillProgress {
  senseId: string;
  skill: Skill;
  /** Transparent heuristic estimate from self-ratings; not a validated mastery probability. */
  score: number;
  attempts: number;
  dueAt: string | null;
  intervalDays: number;
}

export interface LearningState {
  version: 1;
  saved: SavedSense[];
  evidence: Evidence[];
  /** Reader completion percentage, from 0 to 100. */
  readerProgress: number;
}

export type ClockInput = string | Date;
