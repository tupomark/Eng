import {
  LEARNING_SKILLS,
  TASK_FORMATS,
  type AssistanceSnapshot,
  type LearningTarget,
  type TaskAttempt,
  type TaskChallenge,
  type TaskCompetenceSummary,
  type TaskDefinition,
  type TaskEvaluation,
  type TaskFormat,
  type TaskObservation,
  type TaskSkill,
} from "./types";

export function taskIdentifier(value: string, label = "Identifier"): void {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new Error(`${label} must contain 1–200 characters.`);
}

/** Property order never changes retry identity after JSON persistence. */
export function sameTaskValue(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown) =>
    JSON.stringify(value, (_key, entry: unknown) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? Object.fromEntries(
            Object.entries(entry).sort(([a], [b]) =>
              a < b ? -1 : a > b ? 1 : 0,
            ),
          )
        : entry,
    );
  return canonical(left) === canonical(right);
}

export function taskTimestamp(value: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    throw new Error("A valid UTC timestamp is required.");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds))
    throw new Error("A valid UTC timestamp is required.");
  const normalized = new Date(milliseconds).toISOString();
  if (normalized.slice(0, 19) !== value.slice(0, 19))
    throw new Error("The timestamp contains an invalid calendar date.");
  return normalized;
}

export function assertTargetSkill(
  target: LearningTarget,
  skill: TaskSkill,
): void {
  if (!target || (target.kind !== "sense" && target.kind !== "grammar"))
    throw new Error("A sense or grammar concept target is required.");
  taskIdentifier(
    target.kind === "sense" ? target.senseId : target.conceptId,
    "Target ID",
  );
  if (target.kind === "grammar") {
    if (skill !== "grammar")
      throw new Error("Grammar concepts require grammar evidence.");
  } else if (
    !LEARNING_SKILLS.includes(skill as (typeof LEARNING_SKILLS)[number])
  ) {
    throw new Error("A sense requires a supported lexical skill.");
  }
}

const FORMAT_SKILLS: Record<TaskFormat, readonly TaskSkill[]> = {
  recognition: ["recognition"],
  "context-gap": ["context", "recall"],
  recall: ["recall"],
  "translation-to-en": ["recall"],
  "translation-from-en": ["context"],
  "own-sentence": ["writing"],
  "listening-comprehension": ["listening"],
  speech: ["speaking"],
  pronunciation: ["pronunciation"],
  "grammar-choice": ["grammar"],
};

function boundedText(
  value: unknown,
  label: string,
  maximum: number,
  allowEmpty = false,
): asserts value is string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > maximum
  )
    throw new Error(`${label} must be text of at most ${maximum} characters.`);
}

/** Validate before persisting or executing authored, imported or generated tasks. */
export function assertTaskDefinition(task: TaskDefinition): void {
  taskIdentifier(task.id, "Task ID");
  taskIdentifier(task.version, "Task version");
  assertTargetSkill(task.target, task.skill);
  if (
    !TASK_FORMATS.includes(task.format) ||
    !FORMAT_SKILLS[task.format].includes(task.skill)
  )
    throw new Error("The task format cannot measure the requested skill.");
  boundedText(task.prompt, "Prompt", 8_000);
  boundedText(task.explanation, "Explanation", 4_000);
  taskIdentifier(task.promptFamily, "Prompt family");
  taskIdentifier(task.rubricVersion, "Rubric version");
  if (!Array.isArray(task.acceptedAnswers) || task.acceptedAnswers.length > 100)
    throw new Error("Accepted answers must be a bounded list.");
  if (task.evaluator === "deterministic" && task.acceptedAnswers.length === 0)
    throw new Error("A deterministic task requires explicit accepted answers.");
  for (const answer of [
    ...task.acceptedAnswers,
    ...(task.partialAnswers ?? []),
  ])
    boundedText(answer, "Accepted answer", 4_000);
  if (
    !Array.isArray(task.hints) ||
    task.hints.length > 20 ||
    new Set(task.hints.map((hint) => hint.id)).size !== task.hints.length
  )
    throw new Error("Task hints must have unique IDs and a bounded count.");
  for (const hint of task.hints) {
    taskIdentifier(hint.id, "Hint ID");
    boundedText(hint.text, "Hint", 2_000);
  }
  if (
    !["deterministic", "semantic", "speech", "pronunciation"].includes(
      task.evaluator,
    )
  )
    throw new Error("Unsupported evaluator capability.");
  if (
    ["own-sentence", "speech", "pronunciation"].includes(task.format) &&
    task.evaluator === "deterministic"
  )
    throw new Error(
      "Open production cannot be assessed by an exact answer match.",
    );
  if (task.format === "pronunciation" && task.evaluator !== "pronunciation")
    throw new Error(
      "Pronunciation requires a specialized pronunciation evaluator.",
    );
  if (task.format === "speech" && task.evaluator !== "speech")
    throw new Error("Speech requires its own evaluator.");
  if (task.format === "listening-comprehension")
    taskIdentifier(task.audioSourceId!, "Playable audio source");
  for (const field of [
    task.source?.provider,
    task.source?.version,
    task.source?.rights,
  ])
    boundedText(field, "Task provenance", 1_000);
  if (!["editorial", "user", "ai"].includes(task.source.kind))
    throw new Error("Unsupported task provenance.");
  if (task.context) {
    taskIdentifier(task.context.id, "Context ID");
    boundedText(task.context.excerpt, "Context excerpt", 2_000, true);
  }
}

/** NFC, whitespace and case only. Never remove negation, punctuation, accents or words. */
export function normalizeTaskAnswer(
  answer: string,
  caseSensitive = false,
): string {
  const normalized = answer.normalize("NFC").trim().replace(/\s+/gu, " ");
  return caseSensitive ? normalized : normalized.toLocaleLowerCase("en-US");
}

function copyAssistance(assistance: AssistanceSnapshot): AssistanceSnapshot {
  return { ...assistance, hintIds: [...assistance.hintIds] };
}

function assertAttempt(task: TaskDefinition, attempt: TaskAttempt): void {
  assertTaskDefinition(task);
  taskIdentifier(attempt.id, "Attempt ID");
  if (attempt.taskId !== task.id || attempt.taskVersion !== task.version)
    throw new Error("The attempt belongs to a different task revision.");
  taskTimestamp(attempt.startedAt);
  if (
    attempt.submittedAt &&
    Date.parse(taskTimestamp(attempt.submittedAt)) <
      Date.parse(attempt.startedAt)
  )
    throw new Error(
      "An answer cannot be submitted before its attempt started.",
    );
}

export function beginTask(
  task: TaskDefinition,
  attemptId: string,
  now: string,
): TaskAttempt {
  assertTaskDefinition(task);
  taskIdentifier(attemptId, "Attempt ID");
  return {
    id: attemptId,
    taskId: task.id,
    taskVersion: task.version,
    answer: "",
    startedAt: taskTimestamp(now),
    status: "answering",
    assistance: { hintIds: [], acceptedCorrection: false },
  };
}

/** Draft edits are durable UI state and never learning observations. */
export function saveTaskAnswer(
  task: TaskDefinition,
  attempt: TaskAttempt,
  answer: string,
): TaskAttempt {
  assertAttempt(task, attempt);
  boundedText(answer, "Answer draft", 8_000, true);
  if (attempt.status !== "answering")
    throw new Error(
      "A submitted attempt cannot be edited. Start a new attempt instead.",
    );
  if (attempt.answer === answer) return attempt;
  return { ...attempt, answer, assistance: copyAssistance(attempt.assistance) };
}

export function revealTaskHelp(
  task: TaskDefinition,
  attempt: TaskAttempt,
  help: { kind: "hint"; hintId: string } | { kind: "answer" | "transcript" },
  now: string,
): TaskAttempt {
  assertAttempt(task, attempt);
  if (attempt.status !== "answering")
    throw new Error("Help for a submitted attempt cannot change its evidence.");
  const timestamp = taskTimestamp(now);
  if (Date.parse(timestamp) < Date.parse(attempt.startedAt))
    throw new Error("Help cannot predate the attempt.");
  const assistance = copyAssistance(attempt.assistance);
  if (help.kind === "hint") {
    if (!task.hints.some((hint) => hint.id === help.hintId))
      throw new Error("The hint does not belong to this task.");
    if (assistance.hintIds.includes(help.hintId)) return attempt;
    assistance.hintIds.push(help.hintId);
  } else if (help.kind === "answer") {
    assistance.answerRevealedAt ??= timestamp;
  } else {
    if (task.format !== "listening-comprehension")
      throw new Error("Only listening tasks can reveal a transcript.");
    assistance.transcriptRevealedAt ??= timestamp;
  }
  return { ...attempt, assistance };
}

/** Does not grade or create an observation. Store this transition before a remote call. */
export function submitTask(
  task: TaskDefinition,
  attempt: TaskAttempt,
  answer: string,
  now: string,
): TaskAttempt {
  assertAttempt(task, attempt);
  boundedText(answer, "Answer", 8_000);
  if (attempt.status === "submitted" || attempt.status === "evaluated") {
    if (attempt.answer === answer) return attempt;
    throw new Error(
      "This attempt has already been submitted with a different answer.",
    );
  }
  if (attempt.status !== "answering")
    throw new Error("A cancelled attempt cannot be submitted.");
  const submittedAt = taskTimestamp(now);
  if (Date.parse(submittedAt) < Date.parse(attempt.startedAt))
    throw new Error("An answer cannot predate the attempt.");
  return {
    ...attempt,
    answer,
    submittedAt,
    status: "submitted",
    assistance: copyAssistance(attempt.assistance),
  };
}

export function evaluateClosedTask(
  task: TaskDefinition,
  attempt: TaskAttempt,
): TaskEvaluation {
  assertAttempt(task, attempt);
  if (attempt.status !== "submitted" && attempt.status !== "evaluated")
    throw new Error("Submit the answer before evaluation.");
  const base = {
    rubricVersion: task.rubricVersion,
    evaluator: "deterministic" as const,
  };
  if (task.ambiguous)
    return {
      ...base,
      outcome: "uncertain",
      explanation:
        "This prompt is ambiguous. No negative observation has been recorded.",
      reason: "ambiguous-prompt",
    };
  if (task.evaluator !== "deterministic")
    return {
      ...base,
      outcome: "uncertain",
      explanation:
        "This answer needs an evaluator that is not connected. Your answer is preserved without a grade.",
      reason: "evaluator-unavailable",
    };
  if (attempt.assistance.answerRevealedAt)
    return {
      ...base,
      outcome: "uncertain",
      explanation:
        "The answer was revealed before submission. This is practice with help, not an independent assessment.",
      reason: "answer-revealed",
    };
  const answer = normalizeTaskAnswer(attempt.answer, task.caseSensitive);
  const matches = (candidate: string) =>
    normalizeTaskAnswer(candidate, task.caseSensitive) === answer;
  return {
    ...base,
    outcome: task.acceptedAnswers.some(matches)
      ? "accepted"
      : task.partialAnswers?.some(matches)
        ? "partial"
        : "not-yet",
    explanation: task.explanation,
  };
}

/** A provider result is accepted only after server-side schema/semantic validation. */
export function finishTask(
  task: TaskDefinition,
  attempt: TaskAttempt,
  evaluation: TaskEvaluation,
): TaskAttempt {
  assertAttempt(task, attempt);
  if (attempt.status !== "submitted") {
    if (
      attempt.status === "evaluated" &&
      sameTaskValue(attempt.evaluation, evaluation)
    )
      return attempt;
    throw new Error("Only a submitted attempt may receive its final result.");
  }
  if (
    !["accepted", "partial", "not-yet", "uncertain"].includes(
      evaluation.outcome,
    )
  )
    throw new Error("Unknown task outcome.");
  if (evaluation.rubricVersion !== task.rubricVersion)
    throw new Error("The result uses a different rubric revision.");
  boundedText(evaluation.explanation, "Evaluation explanation", 4_000);
  if (
    evaluation.outcome !== "uncertain" &&
    task.evaluator !== "deterministic"
  ) {
    if (evaluation.evaluator !== "provider")
      throw new Error("An open answer requires a real provider result.");
    taskIdentifier(evaluation.provider!, "Evaluation provider");
    taskIdentifier(evaluation.model!, "Evaluation model");
  }
  return {
    ...attempt,
    status: "evaluated",
    evaluation: { ...evaluation },
    assistance: copyAssistance(attempt.assistance),
  };
}

export function observationFromTask(
  task: TaskDefinition,
  attempt: TaskAttempt,
): TaskObservation | null {
  assertAttempt(task, attempt);
  if (
    attempt.status !== "evaluated" ||
    !attempt.evaluation ||
    !attempt.submittedAt ||
    attempt.evaluation.outcome === "uncertain"
  )
    return null;
  if (
    attempt.assistance.answerRevealedAt ||
    attempt.assistance.acceptedCorrection
  )
    return null;
  const independent =
    attempt.assistance.hintIds.length === 0 &&
    !attempt.assistance.transcriptRevealedAt;
  return {
    id: `observation:${attempt.id}`,
    attemptId: attempt.id,
    taskId: task.id,
    taskVersion: task.version,
    target: { ...task.target },
    skill: task.skill,
    format: task.format,
    outcome: attempt.evaluation.outcome,
    occurredAt: attempt.submittedAt,
    assistance: copyAssistance(attempt.assistance),
    independent,
    modality:
      task.format === "speech" || task.format === "pronunciation"
        ? "audio-input"
        : task.format === "listening-comprehension"
          ? "audio-output"
          : "text",
    rubricVersion: attempt.evaluation.rubricVersion,
    evaluationSource: attempt.evaluation.evaluator,
    ...(attempt.evaluation.provider
      ? { provider: attempt.evaluation.provider }
      : {}),
    ...(attempt.evaluation.model ? { model: attempt.evaluation.model } : {}),
    source: { ...task.source },
  };
}

export function targetKey(target: LearningTarget): string {
  return target.kind === "sense"
    ? `sense:${target.senseId}`
    : `grammar:${target.conceptId}`;
}

/** Canonical replay, explicit assistance and no cross-skill credit or pseudo mastery. */
export function summarizeTaskObservations(
  target: LearningTarget,
  skill: TaskSkill,
  observations: readonly TaskObservation[],
  challenges: readonly TaskChallenge[] = [],
): TaskCompetenceSummary {
  assertTargetSkill(target, skill);
  const excluded = new Set(
    challenges.map((challenge) => challenge.observationId),
  );
  const deduplicated = new Map<string, TaskObservation>();
  for (const observation of observations) {
    const previous = deduplicated.get(observation.id);
    if (previous && !sameTaskValue(previous, observation))
      throw new Error("The same observation ID has conflicting contents.");
    deduplicated.set(observation.id, observation);
  }
  const active = [...deduplicated.values()]
    .filter(
      (observation) =>
        targetKey(observation.target) === targetKey(target) &&
        observation.skill === skill &&
        !excluded.has(observation.id),
    )
    .sort(
      (a, b) =>
        Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
        a.id.localeCompare(b.id, "en"),
    );
  return {
    target: { ...target },
    skill,
    status: active.length ? "observed" : "insufficient-data",
    observations: active.length,
    independentObservations: active.filter(
      (observation) => observation.independent,
    ).length,
    accepted: active.filter((observation) => observation.outcome === "accepted")
      .length,
    partial: active.filter((observation) => observation.outcome === "partial")
      .length,
    notYet: active.filter((observation) => observation.outcome === "not-yet")
      .length,
    assisted: active.filter((observation) => !observation.independent).length,
    lastObservedAt: active.at(-1)?.occurredAt ?? null,
    methodologyVersion: "task-observations-v1",
  };
}
