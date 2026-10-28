export const MEDIA_LIMITS = {
  maxFileBytes: 25 * 1024 * 1024,
  maxFiles: 10,
  maxTranscriptCharacters: 50_000,
} as const;
export type TranscriptVisibility = "hidden" | "partial" | "full";
export interface ListeningSession {
  id: string;
  sourceId: string;
  revision: number;
  position: number;
  duration: number;
  playbackRate: number;
  repeatStart: number | null;
  repeatEnd: number | null;
  repeatEnabled: boolean;
  transcript: string;
  transcriptVisibility: TranscriptVisibility;
  transcriptRevealedAt?: string;
  playedSeconds: number;
  taskAttemptId?: string;
}

export function initialListeningSession(sourceId: string): ListeningSession {
  return {
    id: `session:${sourceId}`,
    sourceId,
    revision: 0,
    position: 0,
    duration: 0,
    playbackRate: 1,
    repeatStart: null,
    repeatEnd: null,
    repeatEnabled: false,
    transcript: "",
    transcriptVisibility: "hidden",
    playedSeconds: 0,
  };
}

export function parseListeningSession(value: unknown): ListeningSession {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Listening session is unreadable.");
  const item = value as Record<string, unknown>;
  const text = (entry: unknown, max = 200) =>
    typeof entry === "string" && entry.length > 0 && entry.length <= max;
  const number = (entry: unknown) =>
    typeof entry === "number" && Number.isFinite(entry) && entry >= 0;
  if (
    !text(item.id) ||
    !text(item.sourceId) ||
    !Number.isSafeInteger(item.revision) ||
    (item.revision as number) < 0 ||
    !number(item.position) ||
    !number(item.duration) ||
    (item.duration as number) > 31_536_000 ||
    ((item.duration as number) > 0 &&
      (item.position as number) > (item.duration as number)) ||
    ![0.5, 0.75, 1, 1.25, 1.5, 2].includes(item.playbackRate as number) ||
    typeof item.repeatEnabled !== "boolean" ||
    !(item.repeatStart === null || number(item.repeatStart)) ||
    !(item.repeatEnd === null || number(item.repeatEnd)) ||
    typeof item.transcript !== "string" ||
    item.transcript.length > MEDIA_LIMITS.maxTranscriptCharacters ||
    !["hidden", "partial", "full"].includes(
      String(item.transcriptVisibility),
    ) ||
    (item.transcriptRevealedAt !== undefined &&
      (!text(item.transcriptRevealedAt, 50) ||
        !Number.isFinite(Date.parse(item.transcriptRevealedAt as string)))) ||
    (item.transcriptVisibility !== "hidden" &&
      item.transcriptRevealedAt === undefined) ||
    !number(item.playedSeconds) ||
    (item.taskAttemptId !== undefined && !text(item.taskAttemptId))
  )
    throw new Error("Listening session is unreadable.");
  if (item.id !== `session:${item.sourceId}`)
    throw new Error(
      "The listening source identity does not match its session.",
    );
  if (
    item.repeatEnabled &&
    !(
      typeof item.repeatStart === "number" &&
      typeof item.repeatEnd === "number" &&
      item.repeatEnd > item.repeatStart &&
      item.repeatEnd <= (item.duration as number)
    )
  )
    throw new Error("A repeat range is invalid.");
  return structuredClone(item) as unknown as ListeningSession;
}

export function updateTranscriptVisibility(
  session: ListeningSession,
  visibility: TranscriptVisibility,
  now: string,
): ListeningSession {
  if (!Number.isFinite(Date.parse(now)))
    throw new Error("A valid disclosure time is required.");
  return parseListeningSession({
    ...session,
    transcriptVisibility: visibility,
    ...(visibility !== "hidden" && !session.transcriptRevealedAt
      ? { transcriptRevealedAt: now }
      : {}),
  });
}

export function setRepeatRange(
  session: ListeningSession,
  start: number,
  end: number,
): ListeningSession {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start ||
    end > session.duration
  )
    throw new Error(
      "Choose an A–B range inside the recording, with B after A.",
    );
  return parseListeningSession({
    ...session,
    repeatStart: start,
    repeatEnd: end,
    repeatEnabled: true,
  });
}

export function updatePlayback(
  session: ListeningSession,
  position: number,
  duration: number,
  playing: boolean,
): ListeningSession {
  if (
    !Number.isFinite(position) ||
    !Number.isFinite(duration) ||
    position < 0 ||
    duration < 0 ||
    duration > 31_536_000
  )
    throw new Error("The media position is unavailable.");
  const bounded = Math.min(position, duration || position);
  const delta = bounded - session.position;
  return parseListeningSession({
    ...session,
    position: bounded,
    duration,
    playedSeconds:
      session.playedSeconds + (playing && delta > 0 && delta <= 2 ? delta : 0),
    ...(session.repeatEnd !== null && session.repeatEnd > duration
      ? { repeatEnabled: false }
      : {}),
  });
}

export function repeatPosition(session: ListeningSession): number | null {
  return session.repeatEnabled &&
    session.repeatStart !== null &&
    session.repeatEnd !== null &&
    session.position >= session.repeatEnd
    ? session.repeatStart
    : null;
}
