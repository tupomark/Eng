import {
  MATERIAL_LIMITS,
  type MaterialChapter,
  type PrivateDocument,
} from "@/domain/materials/types";
import {
  stableTextId,
  assertNotCancelled,
} from "@/domain/imports/lexical-import";
import { archivePath, readBoundedZip } from "./archive";
import {
  list,
  record,
  textContent,
  xhtmlParagraphs,
  xmlDocument,
  plainEntities,
} from "./xml";

export function documentFromText(
  text: string,
  title: string,
  sourceName: string,
  format: "txt" | "paste",
  now: string,
): PrivateDocument {
  if (text.length > MATERIAL_LIMITS.maxDocumentCharacters)
    throw new Error("This document exceeds the 2,000,000-character limit.");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text))
    throw new Error(
      "This file contains binary control characters. Choose a plain TXT document and the correct encoding.",
    );
  const paragraphs = text
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length)
    throw new Error("This document has no readable text.");
  const version = stableTextId(text);
  const id = `document-${version}-${stableTextId(sourceName)}`;
  const chapterId = `${id}:chapter:1`;
  return {
    id,
    version,
    title: title.trim().slice(0, 300) || "Untitled document",
    sourceName: sourceName.slice(0, 500),
    format,
    createdAt: now,
    updatedAt: now,
    rights: "user-provided",
    chapters: [{ id: chapterId, title: "Reading", paragraphs }],
    position: {
      documentVersion: version,
      chapterId,
      paragraphIndex: 0,
      characterOffset: 0,
    },
    bookmarks: [],
  };
}

export async function documentFromEpub(
  bytes: Uint8Array,
  sourceName: string,
  now: string,
  signal?: AbortSignal,
): Promise<PrivateDocument> {
  const files = await readBoundedZip(bytes, signal);
  const mimetype = files.get("mimetype");
  if (
    !mimetype ||
    new TextDecoder().decode(mimetype).trim() !== "application/epub+zip"
  )
    throw new Error("This archive is not an EPUB book.");
  if (files.has("META-INF/encryption.xml"))
    throw new Error(
      "Encrypted EPUB content is not supported. Use a DRM-free edition you are allowed to read.",
    );
  const container = files.get("META-INF/container.xml");
  if (!container) throw new Error("The EPUB container is missing.");
  const root = record(record(xmlDocument(container)).container);
  const rootfile = record(list(record(root.rootfiles).rootfile)[0]);
  const packagePath = archivePath(String(rootfile["@_full-path"] ?? ""));
  const packageBytes = files.get(packagePath);
  if (!packageBytes) throw new Error("The EPUB book description is missing.");
  const book = record(record(xmlDocument(packageBytes)).package);
  const title =
    plainEntities(textContent(record(book.metadata).title)).trim() ||
    sourceName.replace(/\.epub$/iu, "");
  const manifest = new Map(
    list(record(book.manifest).item).map((item) => {
      const value = record(item);
      return [String(value["@_id"]), value] as const;
    }),
  );
  const spine = list(record(book.spine).itemref);
  if (!spine.length || spine.length > MATERIAL_LIMITS.maxChapters)
    throw new Error(
      "This book has no supported reading order or too many chapters.",
    );
  const chapters: MaterialChapter[] = [];
  let total = 0;
  for (const ref of spine) {
    assertNotCancelled(signal);
    const item = manifest.get(String(record(ref)["@_idref"]));
    if (!item || item["@_media-type"] !== "application/xhtml+xml")
      throw new Error("A chapter uses an unsupported EPUB content format.");
    const href = String(item["@_href"] ?? "");
    let decodedHref: string;
    try {
      decodedHref = decodeURIComponent(href.split("#")[0]);
    } catch {
      throw new Error("A chapter contains an invalid encoded file path.");
    }
    const path = archivePath(decodedHref, packagePath);
    const content = files.get(path);
    if (!content) throw new Error("A chapter file is missing from this EPUB.");
    const paragraphs = xhtmlParagraphs(xmlDocument(content, true));
    total += paragraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
    if (total > MATERIAL_LIMITS.maxDocumentCharacters)
      throw new Error(
        "This book exceeds the 2,000,000-character reading limit.",
      );
    chapters.push({
      id: path,
      title:
        paragraphs.find((paragraph) => paragraph.length < 150) ??
        `Chapter ${chapters.length + 1}`,
      paragraphs,
    });
  }
  if (!chapters.some((chapter) => chapter.paragraphs.length))
    throw new Error("No readable text was found in this book.");
  const version = stableTextId(JSON.stringify(chapters));
  const id = `document-${version}-${stableTextId(sourceName)}`;
  return {
    id,
    version,
    title: title.slice(0, 300),
    sourceName: sourceName.slice(0, 500),
    format: "epub",
    createdAt: now,
    updatedAt: now,
    rights: "user-provided",
    chapters,
    position: {
      documentVersion: version,
      chapterId: chapters[0].id,
      paragraphIndex: 0,
      characterOffset: 0,
    },
    bookmarks: [],
  };
}
