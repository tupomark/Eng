import type { TaskAttempt } from "./types";
import type { ScheduleEvent } from "../scheduling";

export type PracticeMode = "quick" | "focused" | "free" | "goal";
export interface PracticeSession {
  version: 1;
  revision: number;
  startedAt: string;
  attemptIds: string[];
  senseId: string;
  format: "recognition" | "recall" | "translation-to-en" | "own-sentence";
}
export function parsePracticeSession(value: unknown): PracticeSession {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Your practice session could not be opened. Its original data has been preserved.",
    );
  const item = value as PracticeSession;
  if (
    item.version !== 1 ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 0 ||
    typeof item.startedAt !== "string" ||
    !Number.isFinite(Date.parse(item.startedAt)) ||
    typeof item.senseId !== "string" ||
    !item.senseId ||
    item.senseId.length > 200 ||
    !["recognition", "recall", "translation-to-en", "own-sentence"].includes(
      item.format,
    ) ||
    !Array.isArray(item.attemptIds) ||
    item.attemptIds.length > 500 ||
    item.attemptIds.some(
      (id) => typeof id !== "string" || !id || id.length > 200,
    ) ||
    new Set(item.attemptIds).size !== item.attemptIds.length
  )
    throw new Error(
      "Your practice session could not be opened. Its original data has been preserved.",
    );
  return {
    version: 1,
    revision: item.revision,
    startedAt: item.startedAt,
    senseId: item.senseId,
    format: item.format,
    attemptIds: [...item.attemptIds],
  };
}

/** Session workload is distinct from competence: uncertain/assisted answers still take time. */
export function practiceSessionPolicy(input: {
  mode: PracticeMode;
  dailyItems: number;
  now: string;
  session: PracticeSession | null;
  attempts: readonly TaskAttempt[];
  ratings: readonly ScheduleEvent[];
}) {
  if (
    !Number.isInteger(input.dailyItems) ||
    input.dailyItems < 1 ||
    input.dailyItems > 100 ||
    !Number.isFinite(Date.parse(input.now))
  )
    throw new Error("Invalid practice workload settings.");
  const completed = input.attempts.filter(
    (attempt) => attempt.status === "evaluated",
  );
  const localDay = new Date(input.now).toDateString();
  const completedToday = completed.filter(
    (attempt) =>
      attempt.submittedAt &&
      new Date(attempt.submittedAt).toDateString() === localDay,
  ).length;
  const selfChecksToday = input.ratings.filter(
    (event) =>
      event.kind === "rating" &&
      event.source === "user-rating" &&
      !event.attemptId &&
      new Date(event.occurredAt).toDateString() === localDay,
  ).length;
  const dailyUsed = completedToday + selfChecksToday;
  const sessionCompleted = completed.filter((attempt) =>
    input.session?.attemptIds.includes(attempt.id),
  ).length;
  const limit =
    input.mode === "quick"
      ? Math.min(5, input.dailyItems)
      : input.mode === "focused"
        ? Math.min(20, input.dailyItems)
        : null;
  const remaining =
    limit === null
      ? null
      : Math.max(
          0,
          Math.min(limit - sessionCompleted, input.dailyItems - dailyUsed),
        );
  return {
    sessionCompleted,
    dailyUsed,
    limit,
    remaining,
    canStart: input.mode !== "goal" && (remaining === null || remaining > 0),
    offersNext: input.mode === "quick" || input.mode === "focused",
  };
}
