import { createHash } from "node:crypto";

const LEXIS_LEGACY_NAMESPACE = "f5017543-b3b7-5f01-9f8b-c120d5356dc2";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 9562 UUIDv5. Identity mapping only; never an authentication token. */
export function uuidV5(namespace: string, name: string): string {
  if (!uuidPattern.test(namespace)) throw new Error("Invalid UUID namespace");
  const bytes = createHash("sha1")
    .update(Buffer.from(namespace.replaceAll("-", ""), "hex"))
    .update(name, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function mapLegacyId(
  userId: string,
  namespace: string,
  legacyId: string,
): string {
  if (
    !uuidPattern.test(userId) ||
    !/^[a-z][a-z0-9-]{0,99}$/.test(namespace) ||
    !legacyId.length ||
    legacyId.length > 500
  ) {
    throw new Error("Invalid legacy identity");
  }
  return uuidV5(
    LEXIS_LEGACY_NAMESPACE,
    JSON.stringify([userId.toLowerCase(), namespace, legacyId]),
  );
}
