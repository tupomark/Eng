"use client";

import Link from "next/link";
import { ArrowRight, Check, Eye, Layers3, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Rating } from "@/domain";
import { useReviewOverview } from "./use-review-overview";
import { seedEntries } from "@/infrastructure/dictionary/seed";
import { useLearning } from "./learning-provider";
import { Shell } from "./shell";

const ratings: { value: Rating; title: string; description: string }[] = [
  { value: "again", title: "Again", description: "I did not recognise it" },
  { value: "hard", title: "Hard", description: "It took some effort" },
  { value: "good", title: "Good", description: "I recognised the meaning" },
  { value: "easy", title: "Easy", description: "It felt familiar" },
];
const availableSenseIds = new Set(
  seedEntries.flatMap((entry) => entry.senses.map((sense) => sense.id)),
);

export function Review() {
  const { state, ready, review, now, progress } = useLearning();
  const { legacyDue: allDue, fsrsDue, migrated } = useReviewOverview();
  const [revealedSense, setRevealedSense] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const ratingInFlight = useRef(false);

  const due = allDue.filter((saved) => availableSenseIds.has(saved.senseId));
  const unavailableDueCount = allDue.length - due.length;
  const unavailableCount = state.saved.filter(
    (saved) => !availableSenseIds.has(saved.senseId),
  ).length;
  const current = due[0];
  useEffect(() => {
    ratingInFlight.current = false;
  }, [current?.senseId]);
  const entry =
    current &&
    seedEntries.find((item) =>
      item.senses.some((sense) => sense.id === current.senseId),
    );
  const sense = entry?.senses.find((item) => item.id === current?.senseId);
  const revealed = Boolean(sense && revealedSense === sense.id);
  const future = progress
    .filter(
      (item) =>
        availableSenseIds.has(item.senseId) &&
        !migrated.has(item.senseId) &&
        item.skill === "recognition" &&
        item.dueAt &&
        Date.parse(item.dueAt) > Date.parse(now),
    )
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  const nextDue = future[0]?.dueAt;

  function rate(rating: Rating) {
    if (!sense || !revealed || ratingInFlight.current) return;
    ratingInFlight.current = true;
    if (review(sense.id, rating)) {
      setReviewed((value) => value + 1);
      setRevealedSense(null);
    } else ratingInFlight.current = false;
  }

  return (
    <Shell title="Learn">
      <div className="review-intro">
        <p className="eyebrow">A little, often</p>
        <h1>Make it familiar.</h1>
        <p className="page-description">
          Return to the meanings you have met. Let understanding grow with each
          encounter.
        </p>
      </div>
      <nav aria-label="Learning workspaces" className="device-actions">
        <Link className="button secondary" href="/learn/practice">
          Smart Cards · FSRS practice
        </Link>
        <Link className="text-link" href="/writing">
          Writing Studio
        </Link>
        <Link className="text-link" href="/grammar">
          Grammar Atlas
        </Link>
        <Link className="text-link" href="/listening">
          Listening Studio
        </Link>
      </nav>
      {fsrsDue.length > 0 && (
        <p className="status-banner" role="status">
          {fsrsDue.length} FSRS objectives are due.{" "}
          <Link href="/learn/practice">Open FSRS practice</Link>
        </p>
      )}
      {migrated.size > 0 && (
        <p className="muted">
          Migrated recognition objectives use their FSRS history in Smart Cards.
          They are not counted again in the legacy self-check queue.
        </p>
      )}
      {ready && unavailableCount > 0 && (
        <p className="status-banner" role="status">
          {unavailableCount} saved{" "}
          {unavailableCount === 1 ? "meaning is" : "meanings are"} unavailable
          in this dictionary version. Your learning data has been preserved.{" "}
          <Link href="/library">Open your library</Link>
        </p>
      )}
      {!ready ? (
        <div className="glass-panel empty-state" role="status">
          Opening your review queue…
        </div>
      ) : !current && fsrsDue.length > 0 ? (
        <div className="glass-panel empty-state">
          <Layers3 size={32} strokeWidth={1.4} />
          <p className="eyebrow">Smart Review</p>
          <h2>Your practice is ready.</h2>
          <p>
            {fsrsDue.length}{" "}
            {fsrsDue.length === 1 ? "objective is" : "objectives are"} due in
            Smart Cards. The original self-check queue has no available meaning
            due right now.
          </p>
          <Link className="button primary" href="/learn/practice">
            Open FSRS practice <ArrowRight size={17} />
          </Link>
        </div>
      ) : !state.saved.length ? (
        <div className="glass-panel empty-state">
          <Layers3 size={32} strokeWidth={1.4} />
          <p className="eyebrow">Smart Review</p>
          <h2>Your first encounter awaits.</h2>
          <p>
            Read a little, save a meaning, and find it here with its original
            context.
          </p>
          <Link className="button primary" href="/reader">
            Open the reader <ArrowRight size={17} />
          </Link>
        </div>
      ) : !current && unavailableDueCount > 0 ? (
        <div className="glass-panel empty-state">
          <h2>Some meanings are unavailable.</h2>
          <p>
            {unavailableDueCount} due{" "}
            {unavailableDueCount === 1 ? "meaning cannot" : "meanings cannot"}{" "}
            be reviewed with this dictionary version. Your saved meanings and
            learning evidence have been preserved.
          </p>
          <Link className="button secondary" href="/library">
            Open your library
          </Link>
          <Link className="text-link" href="/reader">
            Keep reading <ArrowRight size={15} />
          </Link>
        </div>
      ) : !current ? (
        <div className="glass-panel empty-state review-complete">
          <span className="review-complete-icon">
            <Check size={28} />
          </span>
          <p className="eyebrow">Space to let it settle</p>
          <h2>
            {reviewed ? "A little more familiar." : "You are up to date."}
          </h2>
          <p>
            {reviewed
              ? `${reviewed} ${reviewed === 1 ? "meaning revisited" : "meanings revisited"} this session. Your next encounter is scheduled.`
              : "Your saved meanings will return when they are due."}
          </p>
          {nextDue && (
            <p className="muted">
              Next review:{" "}
              <time dateTime={nextDue}>
                {new Date(nextDue).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </p>
          )}
          <Link className="button primary" href="/reader">
            Keep reading <ArrowRight size={17} />
          </Link>
          <Link className="text-link" href="/core">
            See your learning evidence <ArrowRight size={15} />
          </Link>
        </div>
      ) : !sense || !entry ? (
        <div className="glass-panel empty-state">
          <h2>This meaning is unavailable.</h2>
          <p>
            The saved dictionary entry cannot be found in this version. Your
            learning data has been preserved.
          </p>
          <Link className="button secondary" href="/library">
            Open your library
          </Link>
        </div>
      ) : (
        <div className="review-layout">
          <section
            className="review-card glass-panel"
            aria-label="Meaning recognition review"
          >
            <div className="review-card-top">
              <span className="pill">
                <RotateCcw size={13} /> Recognition · Self-check
              </span>
              <span className="muted">
                {due.length} {due.length === 1 ? "meaning" : "meanings"} due
              </span>
            </div>
            <div className="review-prompt">
              <p className="eyebrow">An encounter from your reading</p>
              <h2>{entry.lexeme.lemma}</h2>
              <p className="dictionary-ipa">
                {entry.lexeme.ipa} <span>· {entry.lexeme.partOfSpeech}</span>
              </p>
              <blockquote className="review-context">
                “{current.context.trim() || sense.example}”
              </blockquote>
              <p className="muted">
                Take a moment to recognise the meaning you saved in this
                sentence, then reveal it to check.
              </p>
            </div>
            {!revealed ? (
              <button
                className="button primary review-reveal-button"
                onClick={() => setRevealedSense(sense.id)}
              >
                <Eye size={17} /> Show meaning
              </button>
            ) : (
              <div className="review-reveal" aria-live="polite">
                <p className="review-definition">{sense.definition}</p>
                <p className="dictionary-translation" lang="ru">
                  {sense.translation}
                </p>
                <p className="eyebrow">
                  Your assessment · How familiar did it feel?
                </p>
                <div className="review-ratings">
                  {ratings.map((rating) => (
                    <button
                      key={rating.value}
                      className={`review-rating review-rating-${rating.value}`}
                      onClick={() => rate(rating.value)}
                    >
                      <strong>{rating.title}</strong>
                      <span>{rating.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          <aside className="review-summary">
            <p className="eyebrow">One skill at a time</p>
            <h2>Recognition is a beginning.</h2>
            <p>
              Your own assessment helps plan the next encounter. It is a
              tentative practice signal, without an AI grade or a calibrated
              mastery score. Speaking, writing and active recall need their own
              evidence.
            </p>
            <p className="muted">
              The first scheduler uses a transparent rule: Again returns in 10
              minutes; Hard, Good and Easy begin at 1, 2 and 4 days. Later
              intervals grow with your ratings.
            </p>
            <Link className="text-link" href="/core">
              Review or dispute evidence <ArrowRight size={15} />
            </Link>
          </aside>
        </div>
      )}
    </Shell>
  );
}
