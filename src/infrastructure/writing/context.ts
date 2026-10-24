import type { WritingContext } from "@/domain/writing/workspace";

import { assertLocalWritesAllowed } from "@/infrastructure/storage/local-write-guard";

const PREFIX = "lexis.writing.context.";
const RETENTION = 30 * 60_000;

export function putWritingContext(context: WritingContext): string {
  assertLocalWritesAllowed(window.localStorage);
  const token = crypto.randomUUID();
  sessionStorage.setItem(PREFIX + token, JSON.stringify(context));
  return token;
}

export function readWritingContext(
  token: string | undefined,
): WritingContext | null {
  if (!token || !/^[a-zA-Z0-9-]{1,80}$/.test(token)) return null;
  const raw = sessionStorage.getItem(PREFIX + token);
  if (!raw || raw.length > 8_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const context = value as Partial<WritingContext>;
    if (
      context.version !== 1 ||
      typeof context.draftId !== "string" ||
      context.draftId.length > 200 ||
      typeof context.revisionId !== "string" ||
      context.revisionId.length > 200 ||
      typeof context.excerpt !== "string" ||
      context.excerpt.length > 1_000 ||
      typeof context.createdAt !== "string" ||
      !Number.isFinite(Date.parse(context.createdAt))
    )
      return null;
    const age = Date.now() - Date.parse(context.createdAt);
    if (age < -60_000 || age > RETENTION) {
      sessionStorage.removeItem(PREFIX + token);
      return null;
    }
    return context as WritingContext;
  } catch {
    return null;
  }
}
