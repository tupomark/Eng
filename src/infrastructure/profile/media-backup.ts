import {
  MEDIA_LIMITS,
  parseListeningSession,
  type ListeningSession,
} from "@/domain/listening/session";
import type { LocalMediaMetadata } from "@/infrastructure/listening/media-repository";

/** No permission/license claim is inferred from a previously imported local file. */
export interface MediaBackupAssetMetadata extends LocalMediaMetadata {
  sha256: string;
}
export interface MediaBackupSnapshot {
  version: 1;
  assets: MediaBackupAssetMetadata[];
  sessions: ListeningSession[];
  /** SHA-256 of canonical metadata and sessions, never raw transcript text in a receipt. */
  signature: string;
}
export const MEDIA_BACKUP_MAX_SESSIONS = 100;
export interface MediaBackupConflict {
  kind: "asset" | "session";
  id: string;
  reason: string;
}
export interface MediaBackupRestorePreview {
  assetsToAdd: MediaBackupAssetMetadata[];
  sessionsToAdd: ListeningSession[];
  unchangedAssets: number;
  unchangedSessions: number;
  conflicts: MediaBackupConflict[];
  warnings: { sourceId: string; reason: "source-unavailable" }[];
}

const failure = () =>
  new Error(
    "The media backup is unreadable or contains unsupported data. Existing recordings and transcripts have not been changed.",
  );
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw failure();
  return value as Record<string, unknown>;
}
function allowedKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw failure();
}
function text(value: unknown, limit: number, empty = false): string {
  if (
    typeof value !== "string" ||
    value.length > limit ||
    (!empty && !value.length) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
  )
    throw failure();
  return value;
}
export function parseMediaBackupAsset(
  value: unknown,
): MediaBackupAssetMetadata {
  const item = object(value);
  allowedKeys(item, [
    "id",
    "owner",
    "title",
    "fileName",
    "mime",
    "kind",
    "byteLength",
    "createdAt",
    "sha256",
  ]);
  const id = text(item.id, 200);
  const title = text(item.title, 300, true);
  const fileName = text(item.fileName, 500, true);
  const mime = text(item.mime, 100);
  const createdAt = text(item.createdAt, 50);
  const sha256 = text(item.sha256, 64);
  if (
    item.owner !== "local" ||
    !["audio", "video"].includes(String(item.kind)) ||
    !Number.isSafeInteger(item.byteLength) ||
    Number(item.byteLength) <= 0 ||
    Number(item.byteLength) > MEDIA_LIMITS.maxFileBytes ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !/^[a-f0-9]{64}$/u.test(sha256)
  )
    throw failure();
  if (/^media-[a-f0-9]{64}$/u.test(id) && id !== `media-${sha256}`)
    throw failure();
  const kind = item.kind as "audio" | "video";
  if (
    (kind === "audio" &&
      ![
        "audio/wav",
        "audio/mpeg",
        "audio/ogg",
        "audio/mp4",
        "audio/webm",
      ].includes(mime)) ||
    (kind === "video" && !["video/mp4", "video/webm"].includes(mime))
  )
    throw failure();
  return {
    id,
    owner: "local",
    title,
    fileName,
    mime,
    kind,
    byteLength: Number(item.byteLength),
    createdAt,
    sha256,
  };
}
export function canonicalMediaSession(value: unknown): ListeningSession {
  const item = object(value);
  allowedKeys(item, [
    "id",
    "sourceId",
    "revision",
    "position",
    "duration",
    "playbackRate",
    "repeatStart",
    "repeatEnd",
    "repeatEnabled",
    "transcript",
    "transcriptVisibility",
    "transcriptRevealedAt",
    "playedSeconds",
    "taskAttemptId",
  ]);
  const session = parseListeningSession(item);
  // Explicit fields keep signatures independent of input property insertion order.
  return {
    id: session.id,
    sourceId: session.sourceId,
    revision: session.revision,
    position: session.position,
    duration: session.duration,
    playbackRate: session.playbackRate,
    repeatStart: session.repeatStart,
    repeatEnd: session.repeatEnd,
    repeatEnabled: session.repeatEnabled,
    transcript: session.transcript,
    transcriptVisibility: session.transcriptVisibility,
    ...(session.transcriptRevealedAt !== undefined
      ? { transcriptRevealedAt: session.transcriptRevealedAt }
      : {}),
    playedSeconds: session.playedSeconds,
    ...(session.taskAttemptId !== undefined
      ? { taskAttemptId: session.taskAttemptId }
      : {}),
  };
}
function content(
  assets: readonly MediaBackupAssetMetadata[],
  sessions: readonly ListeningSession[],
) {
  if (
    assets.length > MEDIA_LIMITS.maxFiles ||
    sessions.length > MEDIA_BACKUP_MAX_SESSIONS
  )
    throw failure();
  const order = (a: { id: string }, b: { id: string }) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const parsedAssets = assets.map(parseMediaBackupAsset).sort(order);
  const parsedSessions = sessions.map(canonicalMediaSession).sort(order);
  if (
    new Set(parsedAssets.map((item) => item.id)).size !== parsedAssets.length ||
    new Set(parsedSessions.map((item) => item.id)).size !==
      parsedSessions.length
  )
    throw failure();
  return {
    version: 1 as const,
    assets: parsedAssets,
    sessions: parsedSessions,
  };
}
export async function sha256MediaBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function mediaBackupAssetFingerprint(
  value: MediaBackupAssetMetadata,
): Promise<string> {
  return sha256MediaBytes(
    new TextEncoder().encode(JSON.stringify(parseMediaBackupAsset(value)))
      .buffer,
  );
}
export function mediaBackupSessionFingerprint(
  value: ListeningSession,
): Promise<string> {
  return sha256MediaBytes(
    new TextEncoder().encode(JSON.stringify(canonicalMediaSession(value)))
      .buffer,
  );
}
export async function createMediaBackupSnapshot(
  assets: readonly MediaBackupAssetMetadata[],
  sessions: readonly ListeningSession[],
): Promise<MediaBackupSnapshot> {
  const state = content(assets, sessions);
  const signature = await sha256MediaBytes(
    new TextEncoder().encode(JSON.stringify(state)).buffer,
  );
  return { ...state, signature };
}
export function parseMediaBackupSnapshot(value: unknown): MediaBackupSnapshot {
  const item = object(value);
  allowedKeys(item, ["version", "assets", "sessions", "signature"]);
  if (
    item.version !== 1 ||
    !Array.isArray(item.assets) ||
    !Array.isArray(item.sessions) ||
    typeof item.signature !== "string" ||
    !/^[a-f0-9]{64}$/u.test(item.signature)
  )
    throw failure();
  return { ...content(item.assets, item.sessions), signature: item.signature };
}
export async function verifyMediaBackupSnapshot(
  value: unknown,
): Promise<MediaBackupSnapshot> {
  const parsed = parseMediaBackupSnapshot(value);
  const verified = await createMediaBackupSnapshot(
    parsed.assets,
    parsed.sessions,
  );
  if (verified.signature !== parsed.signature)
    throw new Error(
      "The media backup fingerprint does not match its metadata. Nothing has been restored.",
    );
  return parsed;
}
export function sameMediaBackupAsset(
  a: MediaBackupAssetMetadata,
  b: MediaBackupAssetMetadata,
): boolean {
  return (
    JSON.stringify(parseMediaBackupAsset(a)) ===
    JSON.stringify(parseMediaBackupAsset(b))
  );
}
export function sameMediaBackupSession(
  a: ListeningSession,
  b: ListeningSession,
): boolean {
  return (
    JSON.stringify(canonicalMediaSession(a)) ===
    JSON.stringify(canonicalMediaSession(b))
  );
}
/** Additive only. Changed positions/transcripts are conflicts, never last-write-wins. */
export function previewMediaBackupRestore(
  current: MediaBackupSnapshot,
  incoming: MediaBackupSnapshot,
): MediaBackupRestorePreview {
  const before = parseMediaBackupSnapshot(current);
  const imported = parseMediaBackupSnapshot(incoming);
  const assets = new Map(before.assets.map((item) => [item.id, item]));
  const sessions = new Map(before.sessions.map((item) => [item.id, item]));
  const result: MediaBackupRestorePreview = {
    assetsToAdd: [],
    sessionsToAdd: [],
    unchangedAssets: 0,
    unchangedSessions: 0,
    conflicts: [],
    warnings: [],
  };
  for (const item of imported.assets) {
    const existing = assets.get(item.id);
    if (!existing) {
      result.assetsToAdd.push(item);
      assets.set(item.id, item);
    } else if (sameMediaBackupAsset(existing, item)) result.unchangedAssets++;
    else
      result.conflicts.push({
        kind: "asset",
        id: item.id,
        reason:
          "A recording with this identity has different original metadata or bytes.",
      });
  }
  for (const item of imported.sessions) {
    const existing = sessions.get(item.id);
    if (!existing) {
      result.sessionsToAdd.push(item);
      sessions.set(item.id, item);
    } else if (sameMediaBackupSession(existing, item))
      result.unchangedSessions++;
    else
      result.conflicts.push({
        kind: "session",
        id: item.id,
        reason:
          "This listening session has a different position, transcript or history. Neither version has been overwritten.",
      });
    if (
      !assets.has(item.sourceId) &&
      item.sourceId !== "lexis-original-coast-v1"
    )
      result.warnings.push({
        sourceId: item.sourceId,
        reason: "source-unavailable",
      });
  }
  if (
    assets.size > MEDIA_LIMITS.maxFiles ||
    sessions.size > MEDIA_BACKUP_MAX_SESSIONS
  )
    result.conflicts.push({
      kind: "asset",
      id: "media-capacity",
      reason:
        "The combined media library exceeds this device's supported backup limits.",
    });
  return result;
}
