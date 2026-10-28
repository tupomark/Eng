import type { ImportBatch } from "@/domain/imports/types";

export interface MaterialAnchor {
  documentVersion: string;
  chapterId: string;
  paragraphIndex: number;
  characterOffset: number;
}

export interface MaterialChapter {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface PrivateDocument {
  id: string;
  version: string;
  title: string;
  sourceName: string;
  format: "txt" | "epub" | "paste";
  createdAt: string;
  updatedAt: string;
  rights: "user-provided";
  chapters: MaterialChapter[];
  position: MaterialAnchor;
  bookmarks: {
    id: string;
    anchor: MaterialAnchor;
    excerpt: string;
    createdAt: string;
  }[];
  archivedAt?: string;
}

export interface MaterialsState {
  version: 1;
  owner: "local";
  revision: number;
  documents: PrivateDocument[];
  batches: ImportBatch[];
}

export const MATERIAL_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxExpandedBytes: 20 * 1024 * 1024,
  maxEntryBytes: 2 * 1024 * 1024,
  maxArchiveEntries: 500,
  maxChapters: 250,
  maxDocumentCharacters: 2_000_000,
  maxDocuments: 30,
  maxBatches: 30,
} as const;

export function emptyMaterialsState(): MaterialsState {
  return {
    version: 1,
    owner: "local",
    revision: 0,
    documents: [],
    batches: [],
  };
}
