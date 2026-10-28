"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, Layers3, Mic } from "lucide-react";
import { useReviewOverview } from "./use-review-overview";
import { Shell } from "./shell";
import { Orb } from "./orb";
import { useLearning } from "./learning-provider";
import { useMaterials } from "./materials/use-materials";
import styles from "./home.module.css";

export function Home() {
  const { state, ready } = useLearning();
  const { total: due, fsrsDue } = useReviewOverview();
  const materials = useMaterials();
  const document = materials.state.documents
    .filter((item) => !item.archivedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .at(0);
  const documentChapter = document
    ? Math.max(
        0,
        document.chapters.findIndex(
          (chapter) => chapter.id === document.position.chapterId,
        ),
      )
    : 0;
  const reviews = state.evidence.filter((item) => !item.disputedAt).length;
  const section = Math.min(3, Math.round(state.readerProgress / (100 / 3)) + 1);
  return (
    <Shell title="Home">
      <div className={`home-heading ${styles.heading}`}>
        <div>
          <p className="eyebrow">YOUR PERSONAL ENGLISH SPACE</p>
          <h1>
            {state.saved.length || state.readerProgress
              ? "Good to see you again."
              : "A little space to begin."}
          </h1>
          <p className="intro-copy">
            Continue a reading. Keep a meaning. Make it familiar.
          </p>
        </div>
      </div>
      <section
        className={`home-grid balanced-home ${styles.overview}`}
        aria-label="Your learning overview"
      >
        <article className="continue-card glass-panel">
          <div className="card-label">
            <BookOpen size={17} />
            <span>CONTINUE LEARNING</span>
            <span className="label-end">
              {document
                ? `${documentChapter + 1} / ${document.chapters.length}`
                : `0${section} / 03`}
            </span>
          </div>
          <div className="reading-preview">
            <div className="book-cover" aria-hidden="true">
              <span>
                LEXIS
                <br />
                READINGS
              </span>
              <div className="cover-dune dune-one" />
              <div className="cover-dune dune-two" />
              <div className="cover-dune dune-three" />
              <small>
                {document ? (
                  <>
                    YOUR
                    <br />
                    READING
                  </>
                ) : (
                  <>
                    THE ART
                    <br />
                    OF NOTICING
                  </>
                )}
              </small>
            </div>
            <div>
              <p className="eyebrow">
                {document ? "YOUR PRIVATE MATERIAL" : "A LEXIS ORIGINAL"}
              </p>
              <h2>
                {document ? (
                  document.title
                ) : (
                  <>
                    The art of
                    <br />
                    noticing
                  </>
                )}
              </h2>
              <p>
                {document
                  ? document.chapters[documentChapter]?.title
                  : "A slower look at an ordinary day."}
              </p>
              <div className="reading-meta">
                <span>
                  {document ? document.format.toUpperCase() : "Sample reading"}
                </span>
                <span>
                  {document
                    ? `${document.chapters.length} chapters`
                    : "3 short parts"}
                </span>
              </div>
            </div>
          </div>
          <div className="reading-progress">
            <span>
              {document
                ? "Your structural reading place is saved."
                : state.readerProgress
                  ? `${Math.round(state.readerProgress)}% explored`
                  : "An open page, ready when you are."}
            </span>
            <span>{document ? "On this device" : "About 3 min"}</span>
          </div>
          {!document && (
            <div className="progress-track">
              <span style={{ width: `${state.readerProgress}%` }} />
            </div>
          )}
          <Link
            className="button primary"
            href={
              document
                ? `/reader/${encodeURIComponent(document.id)}`
                : "/reader"
            }
          >
            {document || state.readerProgress > 0
              ? "Continue reading"
              : "Start reading"}
            <ArrowRight size={17} />
          </Link>
          <p className="sample-disclosure">
            {document
              ? "Your content stays in the local browser profile."
              : "Local sample · eight-word editorial dictionary"}
          </p>
          <Link className="text-link" href="/library/import">
            Bring your own material <ArrowRight size={14} />
          </Link>
        </article>
        <Link className="living-core-card" href="/core">
          <div className="card-label">
            <span className="light-dot" />
            LIVING CORE
            <ArrowUpRight size={18} />
          </div>
          <div className="core-visual">
            <Orb />
          </div>
          <div className="core-copy">
            <h2>
              Understanding,
              <br />
              taking shape.
            </h2>
            <p>
              {state.saved.length
                ? `${state.saved.length} ${state.saved.length === 1 ? "meaning" : "meanings"} collected with context.`
                : "Your first encounter is a place to start."}
            </p>
          </div>
          <div className="core-card-footer">
            <span>
              {ready
                ? `${reviews} self-rated ${reviews === 1 ? "review" : "reviews"}`
                : "Opening your history…"}
            </span>
            <span>
              Explore your Core
              <ArrowRight size={14} />
            </span>
          </div>
        </Link>
        <div className="daily-review glass-panel">
          <div className="review-icon">
            <Layers3 size={23} strokeWidth={1.5} />
          </div>
          <div className="daily-review-copy">
            <p className="eyebrow">SMART REVIEW</p>
            <h2>
              {due
                ? fsrsDue.length
                  ? `${due} review ${due === 1 ? "objective" : "objectives"} ready`
                  : `${due} ${due === 1 ? "meaning" : "meanings"} to revisit`
                : "A little, often."}
            </h2>
            <p>
              {due
                ? "Return to a meaning in its original context."
                : "Saved meanings return here for practice."}
            </p>
          </div>
          <Link
            className="round-link"
            href="/learn"
            aria-label="Open Smart Review"
          >
            <ArrowUpRight size={21} />
          </Link>
        </div>
      </section>
      <Link className="voice-invitation" href="/tutor">
        <span className="voice-invitation-icon">
          <Mic size={21} strokeWidth={1.5} />
        </span>
        <span>
          <span className="eyebrow">A SPACE TO SPEAK</span>
          <strong>Find your voice.</strong>
          <span className="muted">
            Explore the visual concept. No recording.
          </span>
        </span>
        <ArrowUpRight size={19} />
      </Link>
    </Shell>
  );
}
