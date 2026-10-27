import {
  MATERIAL_LIMITS,
  type MaterialsState,
  type PrivateDocument,
  type MaterialAnchor,
} from "./types";
import type { ImportBatch } from "../imports/types";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max = 10_000): value is string {
  return typeof value === "string" && value.length <= max;
}
function integer(
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= maximum
  );
}
function date(value: unknown): value is string {
  return text(value, 50) && Number.isFinite(Date.parse(value));
}
function unique(values: unknown[], key: string): boolean {
  const ids = values.map((value) => (object(value) ? value[key] : null));
  return new Set(ids).size === ids.length;
}

function validAnchor(
  value: unknown,
  document: PrivateDocument,
): value is MaterialAnchor {
  if (
    !object(value) ||
    value.documentVersion !== document.version ||
    !text(value.chapterId, 512)
  )
    return false;
  const chapter = document.chapters.find((item) => item.id === value.chapterId);
  return (
    !!chapter &&
    integer(value.paragraphIndex, Math.max(0, chapter.paragraphs.length - 1)) &&
    integer(
      value.characterOffset,
      chapter.paragraphs[value.paragraphIndex]?.length ?? 0,
    )
  );
}

export function parseMaterialsState(value: unknown): MaterialsState {
  if (
    !object(value) ||
    value.version !== 1 ||
    value.owner !== "local" ||
    !integer(value.revision) ||
    !Array.isArray(value.documents) ||
    value.documents.length > MATERIAL_LIMITS.maxDocuments ||
    !Array.isArray(value.batches) ||
    value.batches.length > MATERIAL_LIMITS.maxBatches ||
    !unique(value.documents, "id") ||
    !unique(value.batches, "id")
  )
    throw new Error(
      "Saved materials could not be opened. The original data has been kept unchanged.",
    );
  for (const document of value.documents) {
    if (
      !object(document) ||
      !text(document.id, 512) ||
      !text(document.version, 100) ||
      !text(document.title, 300) ||
      !text(document.sourceName, 500) ||
      !["txt", "epub", "paste"].includes(String(document.format)) ||
      !date(document.createdAt) ||
      !date(document.updatedAt) ||
      document.rights !== "user-provided" ||
      (document.archivedAt !== undefined && !date(document.archivedAt)) ||
      !Array.isArray(document.chapters) ||
      !document.chapters.length ||
      document.chapters.length > MATERIAL_LIMITS.maxChapters ||
      !unique(document.chapters, "id") ||
      !Array.isArray(document.bookmarks) ||
      document.bookmarks.length > 1000 ||
      !unique(document.bookmarks, "id")
    )
      throw new Error(
        "A saved document is unreadable. Its original data has been preserved.",
      );
    let length = 0;
    for (const chapter of document.chapters) {
      if (
        !object(chapter) ||
        !text(chapter.id, 512) ||
        !text(chapter.title, 300) ||
        !Array.isArray(chapter.paragraphs) ||
        chapter.paragraphs.length > 100_000 ||
        chapter.paragraphs.some(
          (paragraph) =>
            !text(paragraph, MATERIAL_LIMITS.maxDocumentCharacters),
        )
      )
        throw new Error(
          "A saved chapter is unreadable. Its original data has been preserved.",
        );
      length += chapter.paragraphs.reduce<number>(
        (sum, paragraph) => sum + String(paragraph).length,
        0,
      );
    }
    if (
      length > MATERIAL_LIMITS.maxDocumentCharacters ||
      !validAnchor(document.position, document as unknown as PrivateDocument) ||
      document.bookmarks.some(
        (bookmark) =>
          !object(bookmark) ||
          !text(bookmark.id, 512) ||
          !text(bookmark.excerpt, 1000) ||
          !date(bookmark.createdAt) ||
          !validAnchor(bookmark.anchor, document as unknown as PrivateDocument),
      )
    )
      throw new Error(
        "A saved reading position is unreadable. Its original data has been preserved.",
      );
  }
  for (const batch of value.batches) {
    if (
      !object(batch) ||
      !text(batch.id, 512) ||
      !text(batch.sourceName, 500) ||
      !["txt", "csv", "xlsx", "paste"].includes(String(batch.format)) ||
      !date(batch.createdAt) ||
      (batch.rolledBackAt !== undefined && !date(batch.rolledBackAt)) ||
      !Array.isArray(batch.rows) ||
      batch.rows.length > 10_000 ||
      !unique(batch.rows, "id")
    )
      throw new Error(
        "A saved import is unreadable. Its original data has been preserved.",
      );
    for (const row of batch.rows) {
      if (
        !object(row) ||
        !text(row.id, 512) ||
        !integer(row.rowNumber, 10_001) ||
        !Array.isArray(row.original) ||
        row.original.length > 32 ||
        row.original.some((cell) => !text(cell)) ||
        !["term", "translation", "context", "source", "partOfSpeech"].every(
          (key) => text(row[key]),
        ) ||
        !["pending", "accepted", "deferred", "rejected"].includes(
          String(row.disposition),
        ) ||
        !(row.senseId === null || text(row.senseId, 512)) ||
        (row.duplicateOf !== undefined && !text(row.duplicateOf, 512)) ||
        (row.error !== undefined && !text(row.error, 1000))
      )
        throw new Error(
          "A saved import row is unreadable. Its original data has been preserved.",
        );
    }
  }
  return structuredClone(value) as unknown as MaterialsState;
}

export function addDocument(
  state: MaterialsState,
  document: PrivateDocument,
): MaterialsState {
  const existing = state.documents.find((item) => item.id === document.id);
  if (existing) {
    if (JSON.stringify(existing.chapters) !== JSON.stringify(document.chapters))
      throw new Error(
        "This document identifier conflicts with different content. Your existing document is unchanged.",
      );
    return state;
  }
  if (state.documents.length >= MATERIAL_LIMITS.maxDocuments)
    throw new Error(
      "This device supports 30 documents. Export and remove one before adding another.",
    );
  return {
    ...state,
    revision: state.revision + 1,
    documents: [...state.documents, document],
  };
}

export function addImportBatch(
  state: MaterialsState,
  batch: ImportBatch,
): MaterialsState {
  const existing = state.batches.find((item) => item.id === batch.id);
  if (existing) {
    if (
      existing.sourceName !== batch.sourceName ||
      JSON.stringify(existing.rows.map((row) => row.original)) !==
        JSON.stringify(batch.rows.map((row) => row.original))
    )
      throw new Error(
        "This import identifier conflicts with different data. Your existing import is unchanged.",
      );
    return state;
  }
  if (state.batches.length >= MATERIAL_LIMITS.maxBatches)
    throw new Error(
      "This device supports 30 import batches. Export a backup before removing old batches.",
    );
  return {
    ...state,
    revision: state.revision + 1,
    batches: [...state.batches, batch],
  };
}

/** Restore is additive and rejects conflicting IDs; it never overwrites existing material. */
export function mergeMaterials(
  state: MaterialsState,
  incoming: MaterialsState,
): MaterialsState {
  let next = state;
  for (const document of incoming.documents) next = addDocument(next, document);
  for (const batch of incoming.batches) {
    const existing = next.batches.find((item) => item.id === batch.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(batch))
      throw new Error(
        "An import batch conflicts with your existing data. Nothing has been restored.",
      );
    next = addImportBatch(next, batch);
  }
  return parseMaterialsState(next);
}
