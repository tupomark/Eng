import type { TaskDefinition, TaskEvaluation } from "@/domain/tasks";

export const TUTOR_STYLES = ["mentor", "examiner", "companion"] as const;
export type TutorStyle = (typeof TUTOR_STYLES)[number];
export const TUTOR_SESSION_TYPES = [
  "guided-lesson",
  "conversation-lab",
  "weakness-workshop",
  "real-life-simulation",
  "knowledge-check",
] as const;
export type TutorSessionType = (typeof TUTOR_SESSION_TYPES)[number];
export const TUTOR_BLUEPRINTS: Record<
  TutorSessionType,
  { label: string; purpose: string; steps: readonly string[] }
> = {
  "guided-lesson": {
    label: "Guided Lesson",
    purpose: "Explore one goal, practise it and reflect on the result.",
    steps: [
      "Choose a learning goal",
      "Explore and practise",
      "Reflect and choose what comes next",
    ],
  },
  "conversation-lab": {
    label: "Conversation Lab",
    purpose: "Exchange ideas on a chosen topic, then revisit useful language.",
    steps: ["Choose a topic", "Exchange ideas", "Review useful expressions"],
  },
  "weakness-workshop": {
    label: "Weakness Workshop",
    purpose:
      "Investigate an observed difficulty without assuming a fixed weakness.",
    steps: [
      "Name an example or difficulty",
      "Compare and practise",
      "Review what the evidence supports",
    ],
  },
  "real-life-simulation": {
    label: "Real-Life Simulation",
    purpose: "Rehearse a situation with a clear role and purpose.",
    steps: [
      "Set the situation and roles",
      "Rehearse the exchange",
      "Reflect and try an alternative",
    ],
  },
  "knowledge-check": {
    label: "Knowledge Check",
    purpose: "Choose a skill and explore what a small sample can demonstrate.",
    steps: [
      "Choose one skill and scope",
      "Attempt a task without hidden help",
      "Review limits and next steps",
    ],
  },
};
export interface AiContextScope {
  id: string;
  excerpt: string;
  sourceIds: string[];
}
export interface TutorHistoryTurn {
  role: "user" | "assistant";
  text: string;
  sourceIds: string[];
}
export interface TutorMessageRequest {
  requestId: string;
  sessionId: string;
  style: TutorStyle;
  sessionType: TutorSessionType;
  message: string;
  history: TutorHistoryTurn[];
  context: AiContextScope | null;
  consent: boolean;
}
export interface TutorReply {
  text: string;
  uncertainty: "normal" | "limited-context";
  citedSourceIds: string[];
  nextStep: string | null;
}
export interface VerificationRequest {
  task: TaskDefinition;
  answer: string;
  assisted: boolean;
}
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}
export interface AiProvenance {
  provider: string;
  model: string;
  rubricVersion: string;
  requestId: string;
}
export type AiFailureCode =
  | "awaiting-configuration"
  | "authentication-required"
  | "cancelled"
  | "timeout"
  | "quota-exhausted"
  | "in-progress"
  | "conflict"
  | "invalid-output"
  | "provider-failure"
  | "refused";
export type AiResult<T> =
  | {
      ok: true;
      value: T;
      provenance: AiProvenance;
      usage: AiUsage;
      replayed: boolean;
    }
  | { ok: false; code: AiFailureCode; message: string };
export interface VerificationReply {
  evaluation: TaskEvaluation;
  quote: string;
  alternatives: string[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("This AI request could not be read.");
  return value as Record<string, unknown>;
}
function bounded(value: unknown, max: number, empty = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw new Error("This AI request contains an unsupported value.");
  return value;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("This AI request contains unsupported fields.");
}
export function parseAiContext(value: unknown): AiContextScope | null {
  if (value === null) return null;
  const input = object(value);
  keys(input, ["id", "excerpt", "sourceIds"]);
  if (!Array.isArray(input.sourceIds) || input.sourceIds.length > 8)
    throw new Error("Choose a smaller context scope.");
  return {
    id: bounded(input.id, 200),
    excerpt: bounded(input.excerpt, 1_000),
    sourceIds: input.sourceIds.map((id) => bounded(id, 200)),
  };
}
export function parseTutorMessageRequest(value: unknown): TutorMessageRequest {
  const input = object(value);
  keys(input, [
    "requestId",
    "sessionId",
    "style",
    "sessionType",
    "message",
    "history",
    "context",
    "consent",
  ]);
  if (
    !TUTOR_STYLES.includes(input.style as TutorStyle) ||
    !TUTOR_SESSION_TYPES.includes(input.sessionType as TutorSessionType) ||
    input.consent !== true ||
    !Array.isArray(input.history) ||
    input.history.length > 12
  )
    throw new Error("Choose a session and allow processing before sending.");
  const context = parseAiContext(input.context);
  const history = input.history.map((turn) => {
    const item = object(turn);
    keys(item, ["role", "text", "sourceIds"]);
    if (
      !["user", "assistant"].includes(String(item.role)) ||
      !Array.isArray(item.sourceIds) ||
      item.sourceIds.length > 8
    )
      throw new Error("Conversation history could not be read.");
    const sourceIds = item.sourceIds.map((id) => bounded(id, 200));
    if (sourceIds.some((id) => !context?.sourceIds.includes(id)))
      throw new Error(
        "Conversation history includes a context whose permission has been removed.",
      );
    return {
      role: item.role as TutorHistoryTurn["role"],
      text: bounded(item.text, 6_000),
      sourceIds,
    };
  });
  const requestId = bounded(input.requestId, 100),
    sessionId = bounded(input.sessionId, 100);
  if (
    !/^[A-Za-z0-9_-]+$/u.test(requestId) ||
    !/^[A-Za-z0-9_-]+$/u.test(sessionId)
  )
    throw new Error("This conversation reference could not be read.");
  return {
    requestId,
    sessionId,
    style: input.style as TutorStyle,
    sessionType: input.sessionType as TutorSessionType,
    message: bounded(input.message, 6_000),
    history,
    context,
    consent: true,
  };
}

export const TUTOR_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string" },
    uncertainty: { type: "string", enum: ["normal", "limited-context"] },
    citedSourceIds: { type: "array", items: { type: "string" } },
    nextStep: { type: ["string", "null"] },
  },
  required: ["text", "uncertainty", "citedSourceIds", "nextStep"],
} as const;
export function parseTutorReply(
  value: unknown,
  request: TutorMessageRequest,
): TutorReply {
  const input = object(value);
  keys(input, ["text", "uncertainty", "citedSourceIds", "nextStep"]);
  if (
    !["normal", "limited-context"].includes(String(input.uncertainty)) ||
    !Array.isArray(input.citedSourceIds) ||
    input.citedSourceIds.length > 8
  )
    throw new Error("Tutor returned an unsupported response.");
  const citedSourceIds = input.citedSourceIds.map((id) => bounded(id, 200));
  if (citedSourceIds.some((id) => !request.context?.sourceIds.includes(id)))
    throw new Error("Tutor cited a source outside the permitted context.");
  return {
    text: bounded(input.text, 12_000),
    uncertainty: input.uncertainty as TutorReply["uncertainty"],
    citedSourceIds,
    nextStep: input.nextStep === null ? null : bounded(input.nextStep, 1_000),
  };
}

export const VERIFICATION_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    taskId: { type: "string" },
    skill: { type: "string" },
    outcome: {
      type: "string",
      enum: ["accepted", "partial", "not-yet", "uncertain"],
    },
    explanation: { type: "string" },
    quote: { type: "string" },
    alternatives: { type: "array", items: { type: "string" } },
  },
  required: [
    "taskId",
    "skill",
    "outcome",
    "explanation",
    "quote",
    "alternatives",
  ],
} as const;
export function parseVerificationReply(
  value: unknown,
  request: VerificationRequest,
  provider: string,
  model: string,
): VerificationReply {
  const input = object(value);
  keys(input, [
    "taskId",
    "skill",
    "outcome",
    "explanation",
    "quote",
    "alternatives",
  ]);
  if (
    input.taskId !== request.task.id ||
    input.skill !== request.task.skill ||
    !["accepted", "partial", "not-yet", "uncertain"].includes(
      String(input.outcome),
    ) ||
    !Array.isArray(input.alternatives) ||
    input.alternatives.length > 6
  )
    throw new Error(
      "The assessment does not match the requested task and skill.",
    );
  const quote = bounded(input.quote, 2_000, true);
  if (
    (quote && !request.answer.includes(quote)) ||
    (input.outcome !== "uncertain" && !quote)
  )
    throw new Error(
      "The assessment quotes an answer fragment that was not supplied.",
    );
  if (request.task.ambiguous && input.outcome !== "uncertain")
    throw new Error("An ambiguous task must not be graded.");
  return {
    evaluation: {
      outcome: input.outcome as TaskEvaluation["outcome"],
      explanation: bounded(input.explanation, 4_000),
      rubricVersion: request.task.rubricVersion,
      evaluator: "provider",
      provider,
      model,
    },
    quote,
    alternatives: input.alternatives.map((item) => bounded(item, 1_000)),
  };
}
