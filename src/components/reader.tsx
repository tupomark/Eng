"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DictionaryEntry } from "@/domain";
import { findEntry } from "@/infrastructure/dictionary/seed";
import { useLearning } from "./learning-provider";
import { Modal } from "./modal";
import { ReaderOptions, useReaderPreferences } from "./reader-preferences";

export const READING_TITLE = "The art of noticing";

const sections = [
  {
    label: "A slower beginning",
    paragraphs: [
      "Some mornings invite us to linger. Before the messages arrive and the city gathers speed, there is a small interval of stillness. Light moves across the wall. A cup warms your hands. Nothing asks to be finished yet.",
      "Taking a deliberate pause can change the shape of a day. From the window, you catch a glimpse of a bird beneath the branches. You have passed this tree a hundred times, but today you notice the way its leaves turn toward the light.",
    ],
  },
  {
    label: "Room to wander",
    paragraphs: [
      "Later, you wander through a quiet street without choosing the shortest route. A narrow path opens between two buildings. There is a trace of rain on the stones and a familiar smell of bread in the air.",
      "Attention does not always need a purpose. Sometimes it is enough to follow a line of shade, to listen to a distant conversation, or to linger beside a doorway simply because the afternoon feels kind.",
    ],
  },
  {
    label: "What stays with us",
    paragraphs: [
      "By evening, the smallest details remain. The stillness beneath the trees. A glimpse of an unfamiliar garden. The quiet pleasure of taking a deliberate step away from your usual routine.",
      "Learning a language can begin in much the same way. You meet a word, then notice it again. You trace its meaning through a sentence. Slowly, what was unfamiliar becomes part of the way you see the world.",
    ],
  },
];

function startingSection(progress: number): number {
  if (progress >= 100) return sections.length - 1;
  return Math.min(
    sections.length - 1,
    Math.round(progress / (100 / sections.length)),
  );
}

export function Reader() {
  const {
    state,
    ready,
    error,
    save,
    undoSave,
    canUndoSave: providerCanUndoSave,
    setReaderProgress,
  } = useLearning();
  const readingOptions = useReaderPreferences();
  const [chosenSection, setChosenSection] = useState<number | null>(null);
  const [lookup, setLookup] = useState<{
    word: string;
    context: string;
    entry?: DictionaryEntry;
  } | null>(null);
  const [selectedSense, setSelectedSense] = useState("");
  const [savedNow, setSavedNow] = useState(false);
  const [freshSavedSenseId, setFreshSavedSenseId] = useState<string | null>(
    null,
  );
  const [undone, setUndone] = useState(false);
  const [complete, setComplete] = useState(false);
  const [highlightedToken, setHighlightedToken] = useState<string | null>(null);
  const [selectionCandidate, setSelectionCandidate] = useState<{
    word: string;
    context: string;
    tokenId?: string;
  } | null>(null);
  const readerBodyRef = useRef<HTMLDivElement>(null);
  const sectionIndex = chosenSection ?? startingSection(state.readerProgress);
  const section = sections[sectionIndex];
  const activeSense = lookup?.entry?.senses.find(
    (sense) => sense.id === selectedSense,
  );
  const alreadySaved = Boolean(
    activeSense &&
    state.saved.some((saved) => saved.senseId === activeSense.id),
  );
  const canUndoSave = Boolean(
    activeSense &&
    savedNow &&
    freshSavedSenseId === activeSense.id &&
    alreadySaved &&
    providerCanUndoSave(activeSense.id) &&
    !state.evidence.some((event) => event.senseId === activeSense.id),
  );
  const readerStyle = {
    "--reader-font-size": `${readingOptions.preferences.fontSize}px`,
    "--reader-line-height":
      readingOptions.preferences.lineSpacing === "roomy" ? "2" : "1.75",
  } as CSSProperties;

  function openWord(word: string, context: string, tokenId?: string) {
    const entry = findEntry(word);
    setLookup({ word, context: context.slice(0, 500), entry });
    setHighlightedToken(tokenId ?? null);
    setSelectionCandidate(null);
    setSelectedSense(entry?.senses.length === 1 ? entry.senses[0].id : "");
    setSavedNow(false);
    setFreshSavedSenseId(null);
    setUndone(false);
  }

  useEffect(() => {
    if (lookup !== null) return;
    const readSelection = () => {
      const selection = window.getSelection();
      const word = selection?.toString().trim() ?? "";
      const body = readerBodyRef.current;
      if (
        !body ||
        !selection?.rangeCount ||
        !/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(word)
      ) {
        setSelectionCandidate(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (
        !body.contains(range.startContainer) ||
        !body.contains(range.endContainer)
      ) {
        setSelectionCandidate(null);
        return;
      }
      const anchor =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement;
      const context = anchor?.closest<HTMLElement>("[data-reader-sentence]")
        ?.dataset.readerSentence;
      if (!context) return;
      const tokenId = anchor?.closest<HTMLElement>("[data-reader-token]")?.id;
      setSelectionCandidate((previous) =>
        previous?.word === word &&
        previous.context === context &&
        previous.tokenId === tokenId
          ? previous
          : { word, context, tokenId },
      );
    };
    document.addEventListener("selectionchange", readSelection);
    return () => document.removeEventListener("selectionchange", readSelection);
  }, [lookup, sectionIndex]);

  function paragraph(text: string, paragraphIndex: number) {
    const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
    return sentences.map((sentence, sentenceIndex) => (
      <span key={sentenceIndex} data-reader-sentence={sentence}>
        {sentence
          .split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g)
          .map((token, tokenIndex) => {
            const tokenId = `reader-word-${sectionIndex}-${paragraphIndex}-${sentenceIndex}-${tokenIndex}`;
            return /^[A-Za-z]/.test(token) ? (
              <button
                className={`reader-word${findEntry(token) ? " reader-word-known" : ""}${highlightedToken === tokenId ? " reader-word-selected" : ""}`}
                key={tokenIndex}
                id={tokenId}
                data-reader-token
                aria-label={`Look up ${token}`}
                aria-pressed={highlightedToken === tokenId}
                onClick={(event) => {
                  if (
                    event.detail === 0 ||
                    !window.getSelection()?.toString().trim()
                  )
                    openWord(token, sentence, tokenId);
                }}
              >
                {token}
              </button>
            ) : (
              <span key={tokenIndex}>{token}</span>
            );
          })}
      </span>
    ));
  }

  function moveSection(next: number) {
    const bounded = Math.max(0, Math.min(sections.length - 1, next));
    if (setReaderProgress(Math.round((bounded * 100) / sections.length))) {
      setChosenSection(bounded);
      setComplete(false);
      setSelectionCandidate(null);
      setHighlightedToken(null);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  return (
    <main className="reader-workspace">
      <header className="reader-header">
        <Link
          className="button ghost"
          href="/"
          aria-label="Leave reader and return home"
        >
          <ArrowLeft size={18} />
          <span>Home</span>
        </Link>
        <Link className="reader-brand" href="/">
          LEXIS <span>reader</span>
        </Link>
        <div className="reader-header-tools">
          <ReaderOptions {...readingOptions} />
          <span
            className="reader-section-count"
            aria-label={`Section ${sectionIndex + 1} of ${sections.length}`}
          >
            {sectionIndex + 1}{" "}
            <span className="muted">/ {sections.length}</span>
          </span>
        </div>
      </header>
      {error && (
        <p className="status-banner error" role="alert">
          {error} <Link href="/core">Open Core</Link>
        </p>
      )}
      {readingOptions.error && (
        <p className="status-banner error" role="alert">
          {readingOptions.error}
        </p>
      )}
      {!ready ? (
        <div className="standalone" role="status">
          Opening your reading space…
        </div>
      ) : (
        <>
          <div
            className="reader-progress"
            role="progressbar"
            aria-label="Reading progress"
            aria-valuenow={state.readerProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${state.readerProgress}%` }} />
          </div>
          <div className="reader-layout">
            <article className="reader-article">
              <div className="reader-intro">
                <p className="eyebrow">
                  <BookOpen size={14} /> LEXIS sample · Offline reading
                </p>
                <h1>{READING_TITLE}</h1>
                <p className="reader-deck">
                  A little space to slow down. A new way to see familiar things.
                </p>
                <p className="reader-instruction">
                  <Sparkles size={14} /> Tap a word, or select text and choose
                  Look up selection.
                </p>
              </div>
              {selectionCandidate && (
                <div className="reader-selection-action">
                  <button
                    className="button secondary"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() =>
                      openWord(
                        selectionCandidate.word,
                        selectionCandidate.context,
                        selectionCandidate.tokenId,
                      )
                    }
                  >
                    <Search size={16} /> Look up selection:{" "}
                    {selectionCandidate.word}
                  </button>
                </div>
              )}
              <div
                className="reader-body"
                lang="en"
                ref={readerBodyRef}
                data-reader-font={readingOptions.preferences.font}
                style={readerStyle}
              >
                <p className="eyebrow reader-section-label">
                  0{sectionIndex + 1} — {section.label}
                </p>
                {section.paragraphs.map((text, paragraphIndex) => (
                  <p className="reader-paragraph" key={text}>
                    {paragraph(text, paragraphIndex)}
                  </p>
                ))}
              </div>
              <nav
                className="reader-page-controls"
                aria-label="Reading sections"
              >
                <button
                  className="button ghost"
                  disabled={sectionIndex === 0}
                  onClick={() => moveSection(sectionIndex - 1)}
                >
                  <ChevronLeft size={17} /> Previous
                </button>
                {sectionIndex < sections.length - 1 ? (
                  <button
                    className="button secondary"
                    onClick={() => moveSection(sectionIndex + 1)}
                  >
                    Continue reading <ChevronRight size={17} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    onClick={() => {
                      if (setReaderProgress(100)) setComplete(true);
                    }}
                  >
                    <Check size={17} /> Finish reading
                  </button>
                )}
              </nav>
              {complete && (
                <div className="reader-complete feedback" role="status">
                  <p>
                    Reading complete. Give your new meanings a moment to settle.
                  </p>
                  <Link className="text-link" href="/learn">
                    Open Smart Review <ArrowRight size={15} />
                  </Link>
                </div>
              )}
              <p className="reader-credit muted">
                Original sample written for LEXIS. Your current section stays on
                this device.
              </p>
            </article>
            <aside className="reader-tools glass-panel">
              <span className="reader-tools-icon">
                <BookOpen size={22} strokeWidth={1.5} />
              </span>
              <p className="eyebrow">Read with curiosity</p>
              <h2>Let a word find you.</h2>
              <p>
                Tap any word, choose the meaning that fits, and keep the
                sentence that brought it to life.
              </p>
              <p className="muted">
                Eight editorial dictionary entries are available in this offline
                sample.
              </p>
              <Link className="text-link" href="/learn">
                Your review queue <ArrowRight size={15} />
              </Link>
            </aside>
          </div>
        </>
      )}
      <Modal
        open={lookup !== null}
        onClose={() => setLookup(null)}
        title="Dictionary"
        className="dictionary-modal"
      >
        {lookup?.entry ? (
          <>
            <div className="dictionary-header">
              <p className="eyebrow">In this sentence</p>
              <h2 className="dictionary-word">{lookup.entry.lexeme.lemma}</h2>
              {lookup.word.toLowerCase() !==
                lookup.entry.lexeme.lemma.toLowerCase() && (
                <p className="muted">Selected form: {lookup.word}</p>
              )}
              <p className="dictionary-ipa">
                {lookup.entry.lexeme.ipa}{" "}
                <span>· {lookup.entry.lexeme.partOfSpeech}</span>
              </p>
            </div>
            <blockquote className="dictionary-context">
              “{lookup.context.trim()}”
            </blockquote>
            <fieldset className="dictionary-senses">
              <legend>
                {lookup.entry.senses.length > 1
                  ? "Choose the meaning that fits"
                  : "Meaning"}
              </legend>
              {lookup.entry.senses.map((sense, index) => (
                <label
                  className={`dictionary-sense${selectedSense === sense.id ? " selected" : ""}`}
                  key={sense.id}
                >
                  <input
                    type="radio"
                    name="dictionary-sense"
                    value={sense.id}
                    checked={selectedSense === sense.id}
                    onChange={() => {
                      setSelectedSense(sense.id);
                      setSavedNow(false);
                      setFreshSavedSenseId(null);
                      setUndone(false);
                    }}
                  />
                  <span>
                    <span className="dictionary-sense-number">
                      0{index + 1}
                    </span>
                    <span className="dictionary-definition">
                      {sense.definition}
                    </span>
                    <span className="dictionary-translation" lang="ru">
                      {sense.translation}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="dictionary-actions">
              {error && (
                <p className="status-banner error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary"
                disabled={!activeSense || alreadySaved}
                onClick={() => {
                  if (activeSense && save(activeSense.id, lookup.context)) {
                    setSavedNow(true);
                    setFreshSavedSenseId(activeSense.id);
                    setUndone(false);
                  }
                }}
              >
                {alreadySaved ? (
                  <>
                    <Check size={17} /> Saved to your core
                  </>
                ) : (
                  <>
                    Save this meaning <ArrowRight size={17} />
                  </>
                )}
              </button>
              <p className="muted">
                Saving starts a learning journey. It does not mark this meaning
                as mastered.
              </p>
              {(savedNow || alreadySaved) && (
                <div className="feedback" role="status">
                  <p>
                    {savedNow
                      ? "Meaning and reading context saved on this device."
                      : "This meaning is already in your collection."}
                  </p>
                  <Link className="text-link" href="/learn">
                    Go to Smart Review <ArrowRight size={16} />
                  </Link>
                  {canUndoSave && activeSense && (
                    <button
                      className="button ghost dictionary-undo"
                      onClick={() => {
                        if (undoSave(activeSense.id)) {
                          setSavedNow(false);
                          setFreshSavedSenseId(null);
                          setUndone(true);
                        }
                      }}
                    >
                      Undo save
                    </button>
                  )}
                </div>
              )}
              {undone && (
                <p className="feedback" role="status">
                  Meaning removed from your study pool.
                </p>
              )}
            </div>
            {activeSense && (
              <details className="dictionary-explore" key={activeSense.id}>
                <summary>Explore this meaning</summary>
                <div className="dictionary-detail">
                  <p className="eyebrow">Another encounter</p>
                  <p className="dictionary-example">{activeSense.example}</p>
                  <div
                    className="dictionary-collocations"
                    aria-label="Common combinations"
                  >
                    {activeSense.collocations.map((collocation) => (
                      <span className="pill" key={collocation}>
                        {collocation}
                      </span>
                    ))}
                  </div>
                  <p className="muted">{lookup.entry.provenance.rights}</p>
                </div>
              </details>
            )}
            <p className="dictionary-provenance muted">
              Offline editorial sample · {lookup.entry.provenance.provider} ·{" "}
              {lookup.entry.provenance.version}. Original definitions and
              examples; audio is not included.
            </p>
          </>
        ) : (
          lookup && (
            <div className="empty-state dictionary-empty">
              <p className="eyebrow">Editorial dictionary</p>
              <h2>{lookup.word}</h2>
              <p>
                This word is not included in the first reading dictionary yet.
              </p>
              <p className="muted">
                Try linger, stillness, deliberate, glimpse, beneath, wander,
                trace or quiet.
              </p>
              <button
                className="button secondary"
                onClick={() => setLookup(null)}
              >
                Back to reading
              </button>
            </div>
          )
        )}
      </Modal>
    </main>
  );
}
