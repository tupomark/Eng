"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { ArrowLeft, Bookmark, BookOpen, Search } from "lucide-react";
import {
  ReaderOptions,
  useReaderPreferences,
} from "@/components/reader-preferences";
import { createDictionaryContextLink } from "@/infrastructure/dictionary/context-navigation";
import {
  extractLookupContext,
  lookupTokens,
  validLookupSelection,
} from "@/domain/contextual-lookup";
import type { MaterialAnchor } from "@/domain/materials/types";
import { useMaterials } from "./use-materials";
import styles from "./materials.module.css";

const PARAGRAPHS_PER_PAGE = 80;
interface SelectionCandidate {
  surface: string;
  context: string;
  paragraphIndex: number;
  characterOffset: number;
}

function restoreAnchor(anchor: MaterialAnchor): void {
  const paragraph = window.document.getElementById(
    `paragraph-${anchor.paragraphIndex}`,
  );
  if (!paragraph) return;
  const textNode = paragraph.firstChild;
  const length = textNode?.textContent?.length ?? 0;
  if (
    anchor.characterOffset > 0 &&
    textNode?.nodeType === Node.TEXT_NODE &&
    length > 0
  ) {
    const range = window.document.createRange();
    const offset = Math.min(anchor.characterOffset, length - 1);
    range.setStart(textNode, offset);
    range.setEnd(textNode, offset + 1);
    window.scrollTo({
      top: Math.max(
        0,
        window.scrollY + range.getBoundingClientRect().top - 180,
      ),
      behavior: "instant",
    });
  } else paragraph.scrollIntoView({ block: "start" });
}

export function DocumentReader({ documentId }: { documentId: string }) {
  const materials = useMaterials();
  const options = useReaderPreferences();
  const router = useRouter();
  const [candidate, setCandidate] = useState<SelectionCandidate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const article = useRef<HTMLElement>(null);
  const restored = useRef<string | null>(null);
  const lastAppearance = useRef<string | null>(null);
  const scrollSaving = useRef(false);
  const book = materials.state.documents.find((item) => item.id === documentId);
  const position = book?.position;
  const chapter =
    book?.chapters.find((item) => item.id === position?.chapterId) ??
    book?.chapters[0];
  const chapterIndex =
    book?.chapters.findIndex((item) => item.id === chapter?.id) ?? 0;
  const pageStart =
    Math.floor((position?.paragraphIndex ?? 0) / PARAGRAPHS_PER_PAGE) *
    PARAGRAPHS_PER_PAGE;
  const paragraphs =
    chapter?.paragraphs.slice(pageStart, pageStart + PARAGRAPHS_PER_PAGE) ?? [];
  const readerStyle = {
    "--reader-font-size": `${options.preferences.fontSize}px`,
    "--reader-line-height":
      options.preferences.lineSpacing === "roomy" ? "2" : "1.85",
  } as CSSProperties;
  const saveAnchor = useCallback(
    (anchor: MaterialAnchor) =>
      materials.update((state) => ({
        ...state,
        revision: state.revision + 1,
        documents: state.documents.map((item) =>
          item.id === documentId
            ? { ...item, position: anchor, updatedAt: new Date().toISOString() }
            : item,
        ),
      })),
    [documentId, materials],
  );

  useEffect(() => {
    if (!book || restored.current === book.id) return;
    restored.current = book.id;
    const frame = requestAnimationFrame(() => restoreAnchor(book.position));
    return () => cancelAnimationFrame(frame);
  }, [book]);

  const appearance = `${options.preferences.font}:${options.preferences.fontSize}:${options.preferences.lineSpacing}`;
  useEffect(() => {
    if (!book || lastAppearance.current === appearance) return;
    lastAppearance.current = appearance;
    const frame = requestAnimationFrame(() => restoreAnchor(book.position));
    return () => cancelAnimationFrame(frame);
  }, [appearance, book]);

  useEffect(() => {
    if (!book || !chapter) return;
    const update = () => {
      if (scrollSaving.current) return;
      scrollSaving.current = true;
      requestAnimationFrame(() => {
        scrollSaving.current = false;
        const nodes = article.current?.querySelectorAll<HTMLElement>(
          "[data-paragraph-index]",
        );
        if (!nodes?.length) return;
        let nearest = nodes[0];
        for (const node of nodes) {
          if (node.getBoundingClientRect().top <= 180) nearest = node;
          else break;
        }
        const index = Number(nearest.dataset.paragraphIndex);
        if (index !== book.position.paragraphIndex)
          saveAnchor({
            documentVersion: book.version,
            chapterId: chapter.id,
            paragraphIndex: index,
            characterOffset: 0,
          });
      });
    };
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [book, chapter, saveAnchor]);

  useEffect(() => {
    const selectionChanged = () => {
      const selection = window.getSelection();
      const surface = selection?.toString().trim() ?? "";
      if (
        !selection?.rangeCount ||
        !article.current ||
        !validLookupSelection(surface) ||
        !article.current.contains(selection.anchorNode) ||
        !article.current.contains(selection.focusNode)
      ) {
        setCandidate(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const parent =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement;
      const paragraph = parent?.closest<HTMLElement>("[data-paragraph-index]");
      if (!paragraph) {
        setCandidate(null);
        return;
      }
      const paragraphIndex = Number(paragraph.dataset.paragraphIndex);
      const prefix = range.cloneRange();
      prefix.selectNodeContents(paragraph);
      prefix.setEnd(range.startContainer, range.startOffset);
      const characterOffset = prefix.toString().length;
      const text = paragraph.textContent ?? "";
      const context =
        range.endContainer === range.startContainer
          ? extractLookupContext(
              text,
              characterOffset,
              Math.min(text.length, characterOffset + surface.length),
            )?.context
          : `${text.slice(Math.max(0, characterOffset - 150), characterOffset)}${surface}`.slice(
              0,
              1000,
            );
      setCandidate({
        surface,
        context: context ?? surface,
        paragraphIndex,
        characterOffset,
      });
    };
    window.document.addEventListener("selectionchange", selectionChanged);
    return () =>
      window.document.removeEventListener("selectionchange", selectionChanged);
  }, []);

  function goTo(anchor: MaterialAnchor) {
    if (!saveAnchor(anchor)) return;
    setCandidate(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => restoreAnchor(anchor)),
    );
  }
  function openLookup(selection: SelectionCandidate) {
    if (!book || !chapter) return;
    const anchor: MaterialAnchor = {
      documentVersion: book.version,
      chapterId: chapter.id,
      paragraphIndex: selection.paragraphIndex,
      characterOffset: selection.characterOffset,
    };
    if (!saveAnchor(anchor)) return;
    try {
      const href = createDictionaryContextLink({
        surface: selection.surface,
        excerpt: selection.context.slice(0, 1000),
        returnHref: `/reader/${book.id}#paragraph-${selection.paragraphIndex}`,
        source: { documentId: book.id, ...anchor },
      });
      router.push(href);
    } catch {
      setLookupError(
        "Your selected context could not be kept for Dictionary. Copy it or retry; your reading position is saved.",
      );
    }
  }
  function tapParagraph(
    event: MouseEvent<HTMLParagraphElement>,
    text: string,
    paragraphIndex: number,
  ) {
    // Keep the document as plain selectable text, with no button for every word.
    if (!event.detail || window.getSelection()?.toString().trim()) return;
    let range = window.document.caretRangeFromPoint?.(
      event.clientX,
      event.clientY,
    );
    if (!range) {
      const caret = window.document.caretPositionFromPoint?.(
        event.clientX,
        event.clientY,
      );
      if (caret) {
        range = window.document.createRange();
        range.setStart(caret.offsetNode, caret.offset);
      }
    }
    if (!range || !event.currentTarget.contains(range.startContainer)) return;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(event.currentTarget);
    prefix.setEnd(range.startContainer, range.startOffset);
    const offset = prefix.toString().length;
    const token = lookupTokens(text).find(
      (item) => item.start <= offset && item.end >= offset,
    );
    if (!token) return;
    openLookup({
      surface: token.text,
      context:
        extractLookupContext(text, token.start, token.end)?.context ??
        text.slice(0, 1000),
      paragraphIndex,
      characterOffset: token.start,
    });
  }
  if (!materials.ready)
    return (
      <main className={styles.reader}>
        <div className={styles.article} role="status">
          Opening your document…
        </div>
      </main>
    );
  if (!book || !chapter)
    return (
      <main className={styles.reader}>
        <div className={styles.article}>
          <h1>Document unavailable</h1>
          <p>
            {materials.error ??
              "This document is not stored in this browser. Your saved meanings and learning history have not been removed."}
          </p>
          <Link className="button secondary" href="/library">
            Back to Library
          </Link>
        </div>
      </main>
    );
  const matches = search.trim()
    ? book.chapters
        .flatMap((item) =>
          item.paragraphs.flatMap((text, index) =>
            text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
              ? [{ chapter: item, index, text }]
              : [],
          ),
        )
        .slice(0, 30)
    : [];
  return (
    <main className={styles.reader}>
      <header className={styles.toolbar}>
        <Link className="button ghost" href="/library">
          <ArrowLeft size={18} />
          Library
        </Link>
        <span className="reader-brand">
          LEXIS <span>reader</span>
        </span>
        <div className={styles.row}>
          <ReaderOptions {...options} />
          <button
            className="button ghost"
            onClick={() => {
              const anchor = book.position;
              const id = `${book.id}:${anchor.chapterId}:${anchor.paragraphIndex}:${anchor.characterOffset}`;
              if (
                materials.update((state) => ({
                  ...state,
                  revision: state.revision + 1,
                  documents: state.documents.map((item) =>
                    item.id === book.id
                      ? {
                          ...item,
                          bookmarks: item.bookmarks.some(
                            (bookmark) => bookmark.id === id,
                          )
                            ? item.bookmarks
                            : [
                                ...item.bookmarks,
                                {
                                  id,
                                  anchor,
                                  excerpt:
                                    chapter.paragraphs[
                                      anchor.paragraphIndex
                                    ]?.slice(
                                      anchor.characterOffset,
                                      anchor.characterOffset + 200,
                                    ) ?? "",
                                  createdAt: new Date().toISOString(),
                                },
                              ],
                        }
                      : item,
                  ),
                }))
              )
                setNotice("Bookmark saved at your current paragraph.");
            }}
          >
            <Bookmark size={18} />
            Bookmark
          </button>
        </div>
      </header>
      <div className={`${styles.article} ${styles.documentHeader}`}>
        <p className="eyebrow">
          <BookOpen size={14} /> YOUR PRIVATE DOCUMENT · ON THIS DEVICE
        </p>
        <h1>{book.title}</h1>
        {book.archivedAt && (
          <p className={styles.small}>
            This document is archived. Its text and reading position are still
            available.
          </p>
        )}
        <details className={styles.readingHelp}>
          <summary>Reading help &amp; privacy</summary>
          <p>
            Tap a word, or select an expression and choose Look up selection.
            The original text stays on this device; Dictionary uses a short
            excerpt in this tab.
          </p>
        </details>
        {(materials.error || options.error || lookupError) && (
          <p className="status-banner error" role="alert">
            {lookupError || materials.error || options.error}
          </p>
        )}
        <details className={styles.stack}>
          <summary>Contents, search &amp; bookmarks</summary>
          <label className={styles.label}>
            Chapter
            <select
              className={styles.select}
              aria-label="Chapter"
              value={chapter.id}
              onChange={(event) =>
                goTo({
                  documentVersion: book.version,
                  chapterId: event.target.value,
                  paragraphIndex: 0,
                  characterOffset: 0,
                })
              }
            >
              {book.chapters.map((item, index) => (
                <option value={item.id} key={item.id}>
                  {index + 1}. {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Find in this book
            <input
              className={styles.input}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {search && (
            <ul className={styles.list}>
              {matches.length ? (
                matches.map((match) => (
                  <li key={`${match.chapter.id}:${match.index}`}>
                    <button
                      className="button ghost"
                      onClick={() =>
                        goTo({
                          documentVersion: book.version,
                          chapterId: match.chapter.id,
                          paragraphIndex: match.index,
                          characterOffset: 0,
                        })
                      }
                    >
                      <Search size={16} />
                      {match.text.slice(0, 140)}
                    </button>
                  </li>
                ))
              ) : (
                <li>No matching paragraphs.</li>
              )}
            </ul>
          )}
          <p className={styles.small}>Bookmarks · {book.bookmarks.length}</p>
          <ul className={styles.list}>
            {book.bookmarks.slice(-30).map((bookmark) => (
              <li className={styles.row} key={bookmark.id}>
                <button
                  className="button ghost"
                  onClick={() => goTo(bookmark.anchor)}
                >
                  {bookmark.excerpt || "Empty chapter"}
                </button>
                <button
                  className="button ghost"
                  aria-label={`Remove bookmark ${bookmark.excerpt.slice(0, 40)}`}
                  onClick={() =>
                    materials.update((state) => ({
                      ...state,
                      revision: state.revision + 1,
                      documents: state.documents.map((item) =>
                        item.id === book.id
                          ? {
                              ...item,
                              bookmarks: item.bookmarks.filter(
                                (value) => value.id !== bookmark.id,
                              ),
                            }
                          : item,
                      ),
                    }))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </details>
        <p className={styles.small}>
          Chapter {chapterIndex + 1} of {book.chapters.length} · paragraphs{" "}
          {Math.min(pageStart + 1, chapter.paragraphs.length)}–
          {Math.min(pageStart + PARAGRAPHS_PER_PAGE, chapter.paragraphs.length)}{" "}
          of {chapter.paragraphs.length}
        </p>
      </div>
      <article
        ref={article}
        className={styles.article}
        style={readerStyle}
        data-reader-font={options.preferences.font}
        lang="en"
        aria-label="Document text"
      >
        <h2>{chapter.title}</h2>
        {paragraphs.length ? (
          paragraphs.map((text, index) => (
            <p
              key={`${chapter.id}:${pageStart + index}`}
              id={`paragraph-${pageStart + index}`}
              className={styles.paragraph}
              data-paragraph-index={pageStart + index}
              tabIndex={0}
              onClick={(event) => tapParagraph(event, text, pageStart + index)}
            >
              {text}
            </p>
          ))
        ) : (
          <p>This chapter has no readable text. Choose another chapter.</p>
        )}
      </article>
      <nav
        className={`${styles.article} ${styles.actions}`}
        aria-label="Document pages"
      >
        <button
          className="button ghost"
          disabled={pageStart === 0 && chapterIndex === 0}
          onClick={() => {
            const previous = book.chapters[Math.max(0, chapterIndex - 1)];
            goTo({
              documentVersion: book.version,
              chapterId: pageStart ? chapter.id : previous.id,
              paragraphIndex: pageStart
                ? Math.max(0, pageStart - PARAGRAPHS_PER_PAGE)
                : Math.max(
                    0,
                    Math.floor(
                      (previous.paragraphs.length - 1) / PARAGRAPHS_PER_PAGE,
                    ) * PARAGRAPHS_PER_PAGE,
                  ),
              characterOffset: 0,
            });
          }}
        >
          Previous
        </button>
        <button
          className="button secondary"
          disabled={
            pageStart + PARAGRAPHS_PER_PAGE >= chapter.paragraphs.length &&
            chapterIndex === book.chapters.length - 1
          }
          onClick={() => {
            const next =
              pageStart + PARAGRAPHS_PER_PAGE < chapter.paragraphs.length
                ? chapter
                : book.chapters[chapterIndex + 1];
            goTo({
              documentVersion: book.version,
              chapterId: next.id,
              paragraphIndex:
                next.id === chapter.id ? pageStart + PARAGRAPHS_PER_PAGE : 0,
              characterOffset: 0,
            });
          }}
        >
          Continue reading
        </button>
      </nav>
      {candidate && (
        <div className={styles.selection}>
          <button
            className="button secondary"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => openLookup(candidate)}
          >
            Look up selection: {candidate.surface}
          </button>
        </div>
      )}
      {notice && (
        <div className={styles.article} role="status">
          {notice}
        </div>
      )}
    </main>
  );
}
