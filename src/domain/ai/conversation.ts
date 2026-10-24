import {
  TUTOR_STYLES,
  TUTOR_SESSION_TYPES,
  parseTutorMessageRequest,
  type TutorMessageRequest,
  type AiProvenance,
  type TutorHistoryTurn,
  type TutorStyle,
  type TutorSessionType,
} from "./contracts";

export interface TutorStoredMessage {
  id: string;
  requestId: string;
  role: "user" | "assistant";
  text: string;
  occurredAt: string;
  status: "pending" | "answered" | "unavailable" | "cancelled";
  sourceIds: string[];
  provenance?: AiProvenance;
}
export interface TutorConversation {
  id: string;
  style: TutorStyle;
  sessionType: TutorSessionType;
  phase: number;
  draft: string;
  messages: TutorStoredMessage[];
  pendingRequest?: TutorMessageRequest;
}
export interface TutorWorkspaceState {
  version: 1;
  ownerScope: string;
  activeSessionId: string;
  sessions: TutorConversation[];
}
export function emptyTutorWorkspace(
  ownerScope: string,
  sessionId: string,
): TutorWorkspaceState {
  return {
    version: 1,
    ownerScope,
    activeSessionId: sessionId,
    sessions: [
      {
        id: sessionId,
        style: "mentor",
        sessionType: "guided-lesson",
        phase: 0,
        draft: "",
        messages: [],
      },
    ],
  };
}

export function parseTutorWorkspace(
  value: unknown,
  ownerScope: string,
): TutorWorkspaceState {
  if (!value || typeof value !== "object")
    throw new Error(
      "Tutor data could not be opened; the stored original has been preserved.",
    );
  const input = value as Record<string, unknown>;
  if (
    input.version !== 1 ||
    input.ownerScope !== ownerScope ||
    typeof input.activeSessionId !== "string" ||
    !Array.isArray(input.sessions) ||
    input.sessions.length < 1 ||
    input.sessions.length > 20
  )
    throw new Error(
      "Tutor data belongs to another profile or has an unsupported format.",
    );
  const ids = new Set<string>();
  const bounded = (raw: unknown, max: number) => {
    if (typeof raw !== "string" || raw.length > max)
      throw new Error("Tutor data could not be opened.");
    return raw;
  };
  const sessions = input.sessions.map((raw) => {
    if (!raw || typeof raw !== "object")
      throw new Error("Tutor data could not be opened.");
    const session = raw as Record<string, unknown>;
    const id = bounded(session.id, 100);
    if (
      !id ||
      ids.has(id) ||
      !TUTOR_STYLES.includes(session.style as TutorStyle) ||
      !TUTOR_SESSION_TYPES.includes(session.sessionType as TutorSessionType) ||
      !Number.isSafeInteger(session.phase) ||
      (session.phase as number) < 0 ||
      (session.phase as number) > 2 ||
      !Array.isArray(session.messages) ||
      session.messages.length > 100
    )
      throw new Error("Tutor session could not be opened.");
    ids.add(id);
    const messageIds = new Set<string>();
    const messages = session.messages.map((rawMessage) => {
      if (!rawMessage || typeof rawMessage !== "object")
        throw new Error("Tutor message could not be opened.");
      const message = rawMessage as Record<string, unknown>;
      const messageId = bounded(message.id, 100),
        occurredAt = bounded(message.occurredAt, 40);
      if (
        !messageId ||
        messageIds.has(messageId) ||
        !["user", "assistant"].includes(String(message.role)) ||
        !["pending", "answered", "unavailable", "cancelled"].includes(
          String(message.status),
        ) ||
        !Number.isFinite(Date.parse(occurredAt)) ||
        !Array.isArray(message.sourceIds) ||
        message.sourceIds.length > 8
      )
        throw new Error("Tutor message could not be opened.");
      messageIds.add(messageId);
      let provenance: AiProvenance | undefined;
      if (message.provenance !== undefined) {
        if (!message.provenance || typeof message.provenance !== "object")
          throw new Error("Tutor reply provenance could not be opened.");
        const item = message.provenance as Record<string, unknown>;
        provenance = {
          provider: bounded(item.provider, 200),
          model: bounded(item.model, 200),
          rubricVersion: bounded(item.rubricVersion, 200),
          requestId: bounded(item.requestId, 100),
        };
      }
      if (message.role === "assistant" && !provenance)
        throw new Error(
          "An assistant reply must have its actual provider provenance.",
        );
      return {
        id: messageId,
        requestId: bounded(message.requestId, 100),
        role: message.role as TutorStoredMessage["role"],
        text: bounded(message.text, 12_000),
        occurredAt,
        status: message.status as TutorStoredMessage["status"],
        sourceIds: message.sourceIds.map((id) => bounded(id, 200)),
        ...(provenance ? { provenance } : {}),
      };
    });
    const pendingRequest =
      session.pendingRequest === undefined
        ? undefined
        : parseTutorMessageRequest(session.pendingRequest);
    if (pendingRequest && pendingRequest.sessionId !== id)
      throw new Error(
        "A pending request belongs to a different Tutor session.",
      );
    return {
      id,
      style: session.style as TutorStyle,
      sessionType: session.sessionType as TutorSessionType,
      phase: session.phase as number,
      draft: bounded(session.draft, 6_000),
      messages,
      ...(pendingRequest ? { pendingRequest } : {}),
    };
  });
  if (!ids.has(input.activeSessionId))
    throw new Error("The active Tutor session could not be found.");
  return {
    version: 1,
    ownerScope,
    activeSessionId: input.activeSessionId,
    sessions,
  };
}

/** Revoking a passage also excludes history derived from it; no hidden summary is sent. */
export function permittedTutorHistory(
  messages: TutorStoredMessage[],
  allowedSourceIds: string[],
  omitRequestId?: string,
): TutorHistoryTurn[] {
  return messages
    .filter(
      (message) =>
        message.status === "answered" &&
        message.requestId !== omitRequestId &&
        message.sourceIds.every((id) => allowedSourceIds.includes(id)),
    )
    .slice(-12)
    .map(({ role, text, sourceIds }) => ({ role, text, sourceIds }));
}
