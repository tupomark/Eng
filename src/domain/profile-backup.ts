/** Portable local-profile container, independent from browser storage and React. */
export const PROFILE_JSON_SECTIONS = [
  "learning",
  "tasks",
  "materials",
  "catalog",
  "sense-contexts",
  "goals",
  "preferences",
  "reader-preferences",
  "practice-session",
  "tutor-local",
  "writing",
  "media-metadata",
] as const;
export type ProfileJsonSectionId = (typeof PROFILE_JSON_SECTIONS)[number];
export const PROFILE_BACKUP_LIMITS = Object.freeze({
  maxManifestBytes: 1_024 * 1_024,
  maxParts: 64,
  maxJsonPartBytes: 128 * 1_024 * 1_024,
  maxMediaPartBytes: 25 * 1_024 * 1_024,
  maxFileBytes: 512 * 1_024 * 1_024,
});
export interface ProfileJsonPart {
  readonly id: `section:${ProfileJsonSectionId}`;
  readonly kind: "json";
  readonly section: ProfileJsonSectionId;
  readonly validation: "valid" | "opaque";
  readonly byteLength: number;
  readonly sha256: string;
}
export interface ProfileMediaPart {
  readonly id: string;
  readonly kind: "media";
  readonly byteLength: number;
  readonly sha256: string;
}
export type ProfileBackupPart = ProfileJsonPart | ProfileMediaPart;
export interface ProfileBackupManifest {
  readonly version: 1;
  readonly id: string;
  readonly createdAt: string;
  readonly scope: "local";
  readonly parts: readonly ProfileBackupPart[];
}
const invalid = () =>
  new Error(
    "This profile backup has an invalid or unsupported manifest. Existing data has not been changed.",
  );
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: readonly string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    Object.keys(value).some((key) => !expected.includes(key))
  )
    throw invalid();
}
function part(value: unknown): ProfileBackupPart {
  const entry = record(value);
  if (entry.kind !== "json" && entry.kind !== "media") throw invalid();
  keys(
    entry,
    entry.kind === "json"
      ? ["id", "kind", "section", "validation", "byteLength", "sha256"]
      : ["id", "kind", "byteLength", "sha256"],
  );
  const maxBytes =
    entry.kind === "json"
      ? PROFILE_BACKUP_LIMITS.maxJsonPartBytes
      : PROFILE_BACKUP_LIMITS.maxMediaPartBytes;
  if (
    !Number.isSafeInteger(entry.byteLength) ||
    Number(entry.byteLength) < 0 ||
    Number(entry.byteLength) > maxBytes ||
    typeof entry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(entry.sha256)
  )
    throw invalid();
  if (entry.kind === "json") {
    if (
      !PROFILE_JSON_SECTIONS.includes(entry.section as ProfileJsonSectionId) ||
      entry.id !== `section:${String(entry.section)}` ||
      typeof entry.validation !== "string" ||
      !["valid", "opaque"].includes(entry.validation)
    )
      throw invalid();
    return Object.freeze({
      id: entry.id as ProfileJsonPart["id"],
      kind: "json",
      section: entry.section as ProfileJsonSectionId,
      validation: entry.validation as "valid" | "opaque",
      byteLength: Number(entry.byteLength),
      sha256: entry.sha256,
    });
  }
  // These are identifiers, never extractable filenames or filesystem paths.
  if (
    typeof entry.id !== "string" ||
    !/^asset:[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/u.test(entry.id) ||
    Number(entry.byteLength) === 0
  )
    throw invalid();
  return Object.freeze({
    id: entry.id,
    kind: "media",
    byteLength: Number(entry.byteLength),
    sha256: entry.sha256,
  });
}
export function parseProfileBackupManifest(
  input: unknown,
): ProfileBackupManifest {
  const value = record(input);
  keys(value, ["version", "id", "createdAt", "scope", "parts"]);
  if (
    value.version !== 1 ||
    value.scope !== "local" ||
    typeof value.id !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(
      value.id,
    ) ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    new Date(value.createdAt).toISOString() !== value.createdAt ||
    !Array.isArray(value.parts) ||
    value.parts.length > PROFILE_BACKUP_LIMITS.maxParts
  )
    throw invalid();
  const parts = value.parts.map(part);
  if (
    new Set(parts.map((item) => item.id)).size !== parts.length ||
    parts.reduce((total, item) => total + item.byteLength, 0) >
      PROFILE_BACKUP_LIMITS.maxFileBytes
  )
    throw invalid();
  return Object.freeze({
    version: 1,
    id: value.id,
    createdAt: value.createdAt,
    scope: "local",
    parts: Object.freeze(parts),
  });
}
