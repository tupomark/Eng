import {
  parseProfileBackupManifest,
  PROFILE_BACKUP_LIMITS,
  type ProfileBackupManifest,
  type ProfileBackupPart,
  type ProfileJsonSectionId,
} from "@/domain/profile-backup";

const MAGIC = "LEXISBK1";
const HEADER_BYTES = 12;
const encoder = new TextEncoder();
export interface ProfileContainerProgress {
  phase: "hashing" | "verifying" | "complete";
  partId?: string;
  completedParts: number;
  totalParts: number;
  completedBytes: number;
  totalBytes: number;
}
export interface ProfileContainerOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ProfileContainerProgress) => void;
}
export type ProfileContainerInputPart = (
  | {
      id: `section:${ProfileJsonSectionId}`;
      kind: "json";
      section: ProfileJsonSectionId;
      validation: "valid" | "opaque";
    }
  | { id: string; kind: "media" }
) & { body: Blob };
export interface OpenProfileBackupContainer {
  readonly manifest: ProfileBackupManifest;
  /** SHA-256 of the exact manifest bytes, which bind every expected part hash. Not a signature. */
  readonly fileHash: string;
  readPart(id: string): Promise<Blob>;
  readJsonPart(id: string): Promise<string>;
  verifyAll(): Promise<void>;
}
function abort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException(
      "Profile backup operation was cancelled. Existing data has not been changed.",
      "AbortError",
    );
}
function invalid(): Error {
  return new Error(
    "This file is not a complete supported LEXIS profile backup. Existing data has not been changed.",
  );
}
function exactBytes(bytes: ArrayBuffer, expected: number): ArrayBuffer {
  if (bytes.byteLength !== expected) throw invalid();
  return bytes;
}
function decode(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error(
      "A profile backup JSON section is not valid UTF-8. Existing data has not been changed.",
    );
  }
}
async function hashBytes(
  bytes: ArrayBuffer,
  signal?: AbortSignal,
): Promise<string> {
  abort(signal);
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "This browser cannot verify profile backup integrity. Open LEXIS on a secure page.",
    );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  abort(signal);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
/** One bounded part at a time; never materialize the complete backup in an ArrayBuffer. */
export async function hashProfileBlob(
  blob: Blob,
  options: Pick<ProfileContainerOptions, "signal"> = {},
): Promise<string> {
  abort(options.signal);
  if (
    !Number.isSafeInteger(blob.size) ||
    blob.size < 0 ||
    blob.size > PROFILE_BACKUP_LIMITS.maxJsonPartBytes
  )
    throw invalid();
  const bytes = exactBytes(await blob.arrayBuffer(), blob.size);
  return hashBytes(bytes, options.signal);
}
/** JSON escaping preserves every original UTF-16 code unit, including lone surrogates and absence. */
export function createProfileJsonBody(raw: string | null): Blob {
  if (raw !== null && typeof raw !== "string") throw invalid();
  if (raw === null)
    return new Blob(['{"raw":null}'], { type: "application/json" });
  if (raw.length + 10 > PROFILE_BACKUP_LIMITS.maxJsonPartBytes) throw invalid();
  const chunks: BlobPart[] = ['{"raw":"'];
  let byteLength = 10;
  // Avoid a second, potentially six-times-expanded whole JSON string in JS memory.
  for (let start = 0; start < raw.length; start += 65_536) {
    const text = JSON.stringify(raw.slice(start, start + 65_536)).slice(1, -1);
    const chunk = new Blob([text]);
    byteLength += chunk.size;
    if (byteLength > PROFILE_BACKUP_LIMITS.maxJsonPartBytes) throw invalid();
    chunks.push(chunk);
  }
  chunks.push('"}');
  return new Blob(chunks, { type: "application/json" });
}
export function parseProfileJsonBody(text: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalid();
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    Object.keys(value)[0] !== "raw" ||
    !("raw" in value) ||
    (value.raw !== null && typeof value.raw !== "string")
  )
    throw invalid();
  return value.raw;
}
export function hashProfileRaw(
  raw: string | null,
  options: Pick<ProfileContainerOptions, "signal"> = {},
): Promise<string> {
  return hashProfileBlob(createProfileJsonBody(raw), options);
}
function progress(
  options: ProfileContainerOptions,
  phase: ProfileContainerProgress["phase"],
  completedParts: number,
  totalParts: number,
  completedBytes: number,
  totalBytes: number,
  partId?: string,
) {
  options.onProgress?.({
    phase,
    completedParts,
    totalParts,
    completedBytes,
    totalBytes,
    ...(partId ? { partId } : {}),
  });
  abort(options.signal);
}
async function yieldToUi(signal?: AbortSignal) {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  abort(signal);
}
export async function createProfileBackupContainer(
  input: {
    id: string;
    createdAt: string;
    parts: readonly ProfileContainerInputPart[];
  } & ProfileContainerOptions,
): Promise<Blob> {
  abort(input.signal);
  // Validate every size/identifier before hashing or reading any payload.
  const provisional = parseProfileBackupManifest({
    version: 1,
    id: input.id,
    createdAt: input.createdAt,
    scope: "local",
    parts: input.parts.map(({ body, ...entry }) => ({
      ...entry,
      byteLength: body.size,
      sha256: "0".repeat(64),
    })),
  });
  const totalBytes = provisional.parts.reduce(
    (sum, entry) => sum + entry.byteLength,
    0,
  );
  const provisionalManifestBytes = encoder.encode(JSON.stringify(provisional));
  if (
    provisionalManifestBytes.byteLength >
      PROFILE_BACKUP_LIMITS.maxManifestBytes ||
    HEADER_BYTES + provisionalManifestBytes.byteLength + totalBytes >
      PROFILE_BACKUP_LIMITS.maxFileBytes
  )
    throw invalid();
  const descriptors: ProfileBackupPart[] = [];
  let completedBytes = 0;
  progress(input, "hashing", 0, input.parts.length, 0, totalBytes);
  for (let index = 0; index < input.parts.length; index++) {
    const item = input.parts[index];
    const hash = await hashProfileBlob(item.body, input);
    descriptors.push({ ...provisional.parts[index], sha256: hash });
    completedBytes += item.body.size;
    progress(
      input,
      "hashing",
      index + 1,
      input.parts.length,
      completedBytes,
      totalBytes,
      item.id,
    );
    await yieldToUi(input.signal);
  }
  const manifest = parseProfileBackupManifest({
    ...provisional,
    parts: descriptors,
  });
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  if (
    manifestBytes.byteLength > PROFILE_BACKUP_LIMITS.maxManifestBytes ||
    HEADER_BYTES + manifestBytes.byteLength + totalBytes >
      PROFILE_BACKUP_LIMITS.maxFileBytes
  )
    throw invalid();
  const header = new Uint8Array(HEADER_BYTES);
  header.set(encoder.encode(MAGIC), 0);
  new DataView(header.buffer).setUint32(8, manifestBytes.byteLength, false);
  const result = new Blob(
    [header, manifestBytes, ...input.parts.map((item) => item.body)],
    { type: "application/vnd.lexis.profile" },
  );
  progress(
    input,
    "complete",
    input.parts.length,
    input.parts.length,
    totalBytes,
    totalBytes,
  );
  return result;
}
export async function openProfileBackupContainer(
  file: Blob,
  options: ProfileContainerOptions = {},
): Promise<OpenProfileBackupContainer> {
  abort(options.signal);
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < HEADER_BYTES ||
    file.size > PROFILE_BACKUP_LIMITS.maxFileBytes
  )
    throw invalid();
  const header = exactBytes(
    await file.slice(0, HEADER_BYTES).arrayBuffer(),
    HEADER_BYTES,
  );
  abort(options.signal);
  if (new TextDecoder().decode(header.slice(0, 8)) !== MAGIC) throw invalid();
  const manifestSize = new DataView(header).getUint32(8, false);
  if (
    !manifestSize ||
    manifestSize > PROFILE_BACKUP_LIMITS.maxManifestBytes ||
    HEADER_BYTES + manifestSize > file.size
  )
    throw invalid();
  const manifestBlob = file.slice(HEADER_BYTES, HEADER_BYTES + manifestSize);
  const manifestBytes = exactBytes(
    await manifestBlob.arrayBuffer(),
    manifestSize,
  );
  abort(options.signal);
  let value: unknown;
  try {
    value = JSON.parse(decode(manifestBytes));
  } catch {
    throw invalid();
  }
  const manifest = parseProfileBackupManifest(value);
  const totalBytes = manifest.parts.reduce(
    (sum, entry) => sum + entry.byteLength,
    0,
  );
  if (HEADER_BYTES + manifestSize + totalBytes !== file.size) throw invalid();
  let offset = HEADER_BYTES + manifestSize;
  const locations = new Map(
    manifest.parts.map((part) => {
      const location = { part, start: offset };
      offset += part.byteLength;
      return [part.id, location] as const;
    }),
  );
  const fileHash = await hashProfileBlob(manifestBlob, options);
  async function verified(
    id: string,
  ): Promise<{ body: Blob; bytes: ArrayBuffer }> {
    abort(options.signal);
    const location = locations.get(id);
    if (!location)
      throw new Error(
        "This selected part is not present in the profile backup.",
      );
    const body = file.slice(
      location.start,
      location.start + location.part.byteLength,
      location.part.kind === "json"
        ? "application/json"
        : "application/octet-stream",
    );
    const bytes = exactBytes(
      await body.arrayBuffer(),
      location.part.byteLength,
    );
    if ((await hashBytes(bytes, options.signal)) !== location.part.sha256)
      throw new Error(
        "A profile backup part failed its integrity check. Existing data has not been changed.",
      );
    return { body, bytes };
  }
  async function readPart(id: string): Promise<Blob> {
    return (await verified(id)).body;
  }
  async function readJsonPart(id: string): Promise<string> {
    if (locations.get(id)?.part.kind !== "json")
      throw new Error("This selected part is not a profile JSON section.");
    const result = decode((await verified(id)).bytes);
    abort(options.signal);
    return result;
  }
  return Object.freeze({
    manifest,
    fileHash,
    readPart,
    readJsonPart,
    async verifyAll() {
      let completedBytes = 0;
      progress(options, "verifying", 0, manifest.parts.length, 0, totalBytes);
      for (let index = 0; index < manifest.parts.length; index++) {
        const part = manifest.parts[index];
        if (part.kind === "json") await readJsonPart(part.id);
        else await readPart(part.id);
        completedBytes += part.byteLength;
        progress(
          options,
          "verifying",
          index + 1,
          manifest.parts.length,
          completedBytes,
          totalBytes,
          part.id,
        );
        await yieldToUi(options.signal);
      }
      progress(
        options,
        "complete",
        manifest.parts.length,
        manifest.parts.length,
        totalBytes,
        totalBytes,
      );
    },
  });
}
