export interface VerifiedActor {
  /** Supplied by a verified server-side Auth response, never the request body. */
  userId: string;
}

interface CommandBase {
  key: string;
}
export type LearningCommand =
  | (CommandBase & {
      type: "archive-sense";
      senseId: string;
      expectedRevision: number;
    })
  | (CommandBase & {
      type: "self-review";
      senseId: string;
      eventId: string;
      rating: "again" | "hard" | "good" | "easy";
      occurredAt: string;
      expectedRevision: number;
    })
  | (CommandBase & {
      type: "dispute-evidence";
      evidenceId: string;
      reason: string;
    })
  | (CommandBase & {
      type: "purge-sense";
      senseId: string;
      confirmation: string;
    })
  | (CommandBase & {
      type: "append-writing-revision";
      draftId: string;
      revisionId: string;
      parentRevisionId: string | null;
      body: string;
    });

export class CommandValidationError extends Error {}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function boundedText(
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

export function parseLearningCommand(value: unknown): LearningCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommandValidationError("Choose a supported learning action.");
  }
  const input = value as Record<string, unknown>;
  const fail = () => {
    throw new CommandValidationError(
      "This action is incomplete or contains unsupported data. Your existing history was not changed.",
    );
  };
  if (!boundedText(input.key, 200)) return fail();
  const requireKeys = (keys: string[]) => {
    if (Object.keys(input).some((key) => !keys.includes(key))) fail();
  };
  const requireSense = () => {
    if (!boundedText(input.senseId, 200)) fail();
  };
  const requireRevision = () => {
    if (
      !Number.isSafeInteger(input.expectedRevision) ||
      (input.expectedRevision as number) < 0
    )
      fail();
  };
  switch (input.type) {
    case "archive-sense":
      requireKeys(["type", "key", "senseId", "expectedRevision"]);
      requireSense();
      requireRevision();
      break;
    case "self-review":
      requireKeys([
        "type",
        "key",
        "senseId",
        "expectedRevision",
        "eventId",
        "rating",
        "occurredAt",
      ]);
      requireSense();
      requireRevision();
      if (
        typeof input.eventId !== "string" ||
        !uuidPattern.test(input.eventId) ||
        !["again", "hard", "good", "easy"].includes(String(input.rating)) ||
        typeof input.occurredAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T/.test(input.occurredAt) ||
        !Number.isFinite(Date.parse(input.occurredAt))
      )
        fail();
      break;
    case "dispute-evidence":
      requireKeys(["type", "key", "evidenceId", "reason"]);
      if (
        typeof input.evidenceId !== "string" ||
        !uuidPattern.test(input.evidenceId) ||
        !boundedText(input.reason, 1000, true)
      )
        fail();
      break;
    case "purge-sense":
      requireKeys(["type", "key", "senseId", "confirmation"]);
      requireSense();
      if (input.confirmation !== `DELETE HISTORY: ${input.senseId}`) fail();
      break;
    case "append-writing-revision":
      requireKeys([
        "type",
        "key",
        "draftId",
        "revisionId",
        "parentRevisionId",
        "body",
      ]);
      if (
        typeof input.draftId !== "string" ||
        !uuidPattern.test(input.draftId) ||
        typeof input.revisionId !== "string" ||
        !uuidPattern.test(input.revisionId) ||
        (input.parentRevisionId !== null &&
          (typeof input.parentRevisionId !== "string" ||
            !uuidPattern.test(input.parentRevisionId))) ||
        !boundedText(input.body, 100000, true)
      )
        fail();
      break;
    default:
      return fail();
  }
  return input as unknown as LearningCommand;
}

export interface TrustedLearningCommandPort {
  execute(
    actor: VerifiedActor,
    command: LearningCommand,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}

export async function executeAuthenticatedCommand(
  value: unknown,
  verifyActor: () => Promise<VerifiedActor | null>,
  repository: TrustedLearningCommandPort,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const command = parseLearningCommand(value);
  const actor = await verifyActor();
  if (!actor) throw new AuthenticationRequiredError();
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  return repository.execute(actor, command, signal);
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Sign in again to save this action. Your local work is unchanged.");
  }
}
