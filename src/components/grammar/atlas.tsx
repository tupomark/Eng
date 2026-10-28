"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Check,
  RotateCcw,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { Modal } from "@/components/modal";
import { useTaskLearning } from "@/components/task-learning-provider";
import { usePreferences } from "@/components/preferences-provider";
import { summarizeTaskObservations } from "@/domain/tasks";
import { createReviewIdentity, reviewItemId } from "@/domain/scheduling";
import { GRAMMAR_CONCEPTS, grammarConcept } from "@/domain/writing/grammar";
import type { WritingContext } from "@/domain/writing/workspace";
import { readWritingContext } from "@/infrastructure/writing/context";
import styles from "@/components/writing/workspace.module.css";

export function GrammarAtlas({
  initialConceptId,
  contextToken,
  draftId,
}: {
  initialConceptId?: string;
  contextToken?: string;
  draftId?: string;
}) {
  const learning = useTaskLearning();
  const { preferences } = usePreferences();
  const [selectedId, setSelectedId] = useState(
    grammarConcept(initialConceptId)?.id ?? GRAMMAR_CONCEPTS[0].id,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "saved">("all");
  const [languageOverride, setLanguage] = useState<
    "en" | "ru" | "mixed" | null
  >(null);
  const language = languageOverride ?? preferences.explanationLanguage;
  const [context, setContext] = useState<WritingContext | null>(null);
  const [contextUnavailable, setContextUnavailable] = useState(false);
  const [localAnswer, setLocalAnswer] = useState<{
    attemptId: string;
    value: string;
  } | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeReason, setChallengeReason] = useState("");
  const concept = grammarConcept(selectedId)!;
  const attempt = learning.state.attempts
    .filter(
      (item) =>
        item.taskId === concept.task.id &&
        item.taskVersion === concept.task.version,
    )
    .at(-1);
  const observation =
    attempt &&
    learning.observations.find((item) => item.attemptId === attempt.id);
  const excluded =
    observation &&
    learning.state.challenges.some(
      (item) => item.observationId === observation.id,
    );
  const summary = summarizeTaskObservations(
    concept.task.target,
    "grammar",
    learning.observations,
    learning.state.challenges,
  );
  const showRule =
    !attempt ||
    attempt.status !== "answering" ||
    attempt.assistance.hintIds.length > 0;
  const itemId = reviewItemId(
    concept.task.target,
    "grammar",
    concept.task.promptFamily,
  );
  const item = learning.state.reviewItems.find((entry) => entry.id === itemId);
  const schedule = learning.schedules.find((entry) => entry.item.id === itemId);
  const scheduledAttempt =
    attempt &&
    learning.state.scheduleEvents.some(
      (event) => event.kind === "rating" && event.attemptId === attempt.id,
    );
  const answer =
    localAnswer?.attemptId === attempt?.id
      ? (localAnswer?.value ?? "")
      : (attempt?.answer ?? "");
  const topics = GRAMMAR_CONCEPTS.filter((topic) => {
    const needle = query.normalize("NFC").trim().toLocaleLowerCase();
    const inPractice = learning.state.reviewItems.some(
      (entry) =>
        entry.target.kind === "grammar" &&
        entry.target.conceptId === topic.id &&
        !learning.state.archivedItemIds.includes(entry.id),
    );
    return (
      (filter === "all" || inPractice) &&
      (!needle ||
        `${topic.title} ${topic.description} ${topic.rule} ${topic.russianRule}`
          .toLocaleLowerCase()
          .includes(needle))
    );
  });

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active || !contextToken) return;
      try {
        const value = readWritingContext(contextToken);
        setContext(value);
        setContextUnavailable(!value);
      } catch {
        setContextUnavailable(true);
      }
    });
    return () => {
      active = false;
    };
  }, [contextToken]);

  function startPractice() {
    const started = learning.startTask(concept.task);
    if (started)
      setLocalAnswer({ attemptId: started.id, value: started.answer });
  }

  function selectAnswer(value: string) {
    if (!attempt || attempt.status !== "answering") return;
    setLocalAnswer({ attemptId: attempt.id, value });
    learning.saveAnswer(attempt.id, value);
  }

  const backDraftId = context?.draftId ?? draftId;
  return (
    <Shell title="Grammar Atlas">
      <div className={styles.heading}>
        <p className="eyebrow">GRAMMAR ATLAS</p>
        <h1>A pattern, made clear.</h1>
        <p className="intro-copy">
          Short authored explanations. A careful contrast. Practice that
          measures this concept alone.
        </p>
      </div>
      <div className={styles.actions}>
        <Link
          href={
            backDraftId
              ? `/writing?draft=${encodeURIComponent(backDraftId)}&resume=1`
              : "/learn"
          }
          className="text-link"
        >
          <ArrowLeft size={16} />
          {backDraftId ? "Return to your draft" : "Learn"}
        </Link>
        <span className={styles.caption}>
          Six editorial topics · no live AI evaluation
        </span>
      </div>
      {learning.error && (
        <div role="alert" className={`${styles.alert} ${styles.spaced}`}>
          <p>{learning.error}</p>
          <button className="button secondary small" onClick={learning.reload}>
            Reload practice data
          </button>
        </div>
      )}
      {contextUnavailable && (
        <p role="status" className={`${styles.alert} ${styles.spaced}`}>
          The selected excerpt is unavailable or its 30-minute local context has
          expired. Your saved draft is unchanged; you can return to select the
          passage again.
        </p>
      )}
      {context && (
        <section
          className={`${styles.panel} ${styles.spaced}`}
          aria-label="Context from your writing"
        >
          <p className="eyebrow">YOUR SELECTED PASSAGE</p>
          <blockquote className={styles.prose}>
            {context.excerpt || "No text was selected in this draft yet."}
          </blockquote>
          <p className={styles.caption}>
            A local reference from one exact draft revision. No provider has
            received this excerpt. The exercise below uses its own editorial
            sentence.
          </p>
        </section>
      )}
      <div className={`${styles.layout} ${styles.spaced}`}>
        <section className={styles.canvas}>
          <div className={styles.row}>
            <h2>{concept.title}</h2>
            <button
              className="button ghost small"
              onClick={() => setLanguage(language === "en" ? "ru" : "en")}
            >
              {language === "en" ? "Explain in Russian" : "Explain in English"}
            </button>
          </div>
          {showRule ? (
            <section className={styles.panel} aria-label="Grammar explanation">
              <p className={styles.rule} lang={language === "ru" ? "ru" : "en"}>
                {language === "ru" ? concept.russianRule : concept.rule}
              </p>
              {language === "mixed" && (
                <p className={styles.rule} lang="ru">
                  {concept.russianRule}
                </p>
              )}
              <ul className={styles.examples}>
                {concept.examples.map((example) => (
                  <li key={example.sentence} className={styles.example}>
                    <p>{example.sentence}</p>
                    <p className={styles.caption}>{example.explanation}</p>
                  </li>
                ))}
              </ul>
              <details>
                <summary>When context changes the choice</summary>
                <p className={styles.notice}>{concept.contrast}</p>
              </details>
              <p className={styles.caption}>
                LEXIS editorial · grammar-editorial-v1 · Original authored
                content. Reading this rule creates no learning observation.
              </p>
            </section>
          ) : (
            <p className={styles.notice}>
              The rule is tucked away while you try. You can reveal it with help
              recorded explicitly.
            </p>
          )}
          <section className={styles.panel} aria-label="Grammar practice">
            <div className={styles.row}>
              <h2>Try the pattern.</h2>
              <span className="pill">Grammar concept · text choice</span>
            </div>
            {!learning.ready ? (
              <p role="status">Opening your practice history…</p>
            ) : !attempt ? (
              <>
                <p>
                  This short exercise checks one construction. It does not
                  measure writing proficiency or a general grammar level.
                </p>
                <button className="button primary" onClick={startPractice}>
                  Try without the rule <ArrowUpRight size={16} />
                </button>
              </>
            ) : attempt.status === "answering" ? (
              <form
                className={styles.task}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (answer.trim()) learning.submitTask(attempt.id, answer);
                }}
              >
                <fieldset>
                  <legend>{concept.task.prompt}</legend>
                  <div className={styles.choices}>
                    {concept.options.map((option) => (
                      <label key={option} className={styles.choice}>
                        <input
                          type="radio"
                          name="grammar-answer"
                          value={option}
                          checked={answer === option}
                          onChange={() => selectAnswer(option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {attempt.assistance.hintIds.length > 0 && (
                  <p role="status" className={styles.notice}>
                    {concept.task.hints[0].text} This attempt will be recorded
                    as assisted.
                  </p>
                )}
                {attempt.assistance.answerRevealedAt && (
                  <p role="status" className={styles.notice}>
                    Accepted alternatives:{" "}
                    {concept.task.acceptedAnswers.join(" / ")}. This
                    revealed-answer practice will not create an assessment
                    observation.
                  </p>
                )}
                <div className={styles.actions}>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={!answer.trim()}
                  >
                    Check my choice
                  </button>
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() =>
                      learning.revealHelp(attempt.id, {
                        kind: "hint",
                        hintId: "rule-hint",
                      })
                    }
                    disabled={attempt.assistance.hintIds.length > 0}
                  >
                    Show the rule / hint
                  </button>
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() =>
                      learning.revealHelp(attempt.id, { kind: "answer" })
                    }
                    disabled={Boolean(attempt.assistance.answerRevealedAt)}
                  >
                    Reveal accepted answers
                  </button>
                </div>
                <p className={styles.caption}>
                  Your choice and help state are saved on this device before
                  evaluation.
                </p>
              </form>
            ) : attempt.evaluation ? (
              <div className={styles.task}>
                <div role="status">
                  <h3>
                    {attempt.evaluation.outcome === "accepted"
                      ? "Accepted for this exercise."
                      : attempt.evaluation.outcome === "partial"
                        ? "Part of the pattern is there."
                        : attempt.evaluation.outcome === "uncertain"
                          ? "Practice without a grade."
                          : "Try this construction."}
                  </h3>
                  <p>
                    Your choice: <strong>{attempt.answer}</strong>
                  </p>
                  <p>{attempt.evaluation.explanation}</p>
                  <p className={styles.caption}>
                    {attempt.assistance.hintIds.length
                      ? "Assisted attempt"
                      : "No hint used"}{" "}
                    · {attempt.evaluation.rubricVersion}
                    {observation
                      ? " · Grammar evidence only"
                      : " · No assessment observation"}
                  </p>
                </div>
                {observation &&
                  (excluded ? (
                    <p className="disputed-label">
                      <Check size={15} /> Excluded from active estimates
                    </p>
                  ) : (
                    <button
                      className="button ghost small"
                      onClick={() => setChallengeOpen(true)}
                    >
                      <RotateCcw size={14} /> Challenge this result
                    </button>
                  ))}
                {observation && !excluded && !scheduledAttempt && (
                  <div className={styles.panel}>
                    <p>
                      Choose how soon to revisit this concept. Your scheduling
                      choice is separate from the exercise verdict.
                    </p>
                    <div className={styles.actions}>
                      {(["again", "hard", "good", "easy"] as const).map(
                        (rating) => (
                          <button
                            key={rating}
                            className="button secondary small"
                            onClick={() =>
                              learning.recordRating(itemId, rating, attempt.id)
                            }
                          >
                            {rating[0].toUpperCase() + rating.slice(1)}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
                {scheduledAttempt && schedule && (
                  <p className={styles.caption}>
                    Next FSRS review:{" "}
                    <time dateTime={schedule.card.due}>
                      {new Date(schedule.card.due).toLocaleString()}
                    </time>
                    . A challenge excludes this attempt and its linked rating
                    from replay.
                  </p>
                )}
                <button className="button secondary" onClick={startPractice}>
                  Practice this pattern again
                </button>
                <p className={styles.caption}>
                  The current sample has one exercise per topic. A repeated
                  sentence is not evidence of transfer to new writing.
                </p>
              </div>
            ) : (
              <p role="status">
                Your submitted answer has been kept; reload practice data to
                recover its result.
              </p>
            )}
          </section>
          <section className={styles.panel} aria-label="Grammar evidence">
            <h2>What has been observed</h2>
            <p>
              {summary.observations
                ? `${summary.observations} active ${summary.observations === 1 ? "attempt" : "attempts"} for this concept: ${summary.independentObservations} without hints, ${summary.assisted} assisted.`
                : "Not enough data yet. Reading a rule or adding it to practice is not proof of understanding."}
            </p>
            <p className={styles.caption}>
              Counted once per saved task observation, with challenges excluded.
              No lexical skill or general mastery percentage is inferred.
            </p>
            {item ? (
              <button
                className="button ghost small"
                onClick={() =>
                  learning.archive(
                    itemId,
                    !learning.state.archivedItemIds.includes(itemId),
                  )
                }
              >
                {learning.state.archivedItemIds.includes(itemId)
                  ? "Return this topic to practice"
                  : "Pause this topic in review"}
              </button>
            ) : (
              <button
                className="button secondary small"
                disabled={!learning.ready}
                onClick={() =>
                  learning.ensureReviewItem(
                    createReviewIdentity(
                      concept.task.target,
                      "grammar",
                      concept.task.promptFamily,
                      new Date().toISOString(),
                    ),
                  )
                }
              >
                <Bookmark size={15} /> Include this topic in practice
              </button>
            )}
            <Link className="text-link" href="/core">
              Open your evidence trail <ArrowUpRight size={15} />
            </Link>
          </section>
        </section>
        <aside className={styles.aside}>
          <section className={styles.panel}>
            <h2>Find a useful pattern.</h2>
            <label className={styles.label}>
              Search grammar
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Topic, form or explanation…"
              />
            </label>
            <div className={styles.tabs}>
              <button
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All topics
              </button>
              <button
                aria-pressed={filter === "saved"}
                onClick={() => setFilter("saved")}
              >
                In my practice
              </button>
            </div>
            <div className={styles.concepts}>
              {topics.map((topic) => (
                <button
                  key={topic.id}
                  className={styles.conceptButton}
                  aria-pressed={selectedId === topic.id}
                  onClick={() => {
                    setSelectedId(topic.id);
                    setLocalAnswer(null);
                    const url = new URL(window.location.href);
                    url.searchParams.set("concept", topic.id);
                    window.history.replaceState(window.history.state, "", url);
                  }}
                >
                  <strong>{topic.title}</strong>
                  <span className={styles.caption}>{topic.description}</span>
                </button>
              ))}
              {topics.length === 0 && (
                <p className={styles.notice}>
                  No topics match this search or filter. Your practice history
                  has not changed.
                </p>
              )}
            </div>
          </section>
          <p className={styles.caption}>
            The Atlas currently covers six authored concepts. Contextual AI
            analysis and full curriculum coverage are awaiting further
            implementation and provider configuration.
          </p>
        </aside>
      </div>
      <Modal
        open={challengeOpen}
        onClose={() => setChallengeOpen(false)}
        title="Challenge this grammar result"
      >
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            if (
              observation &&
              challengeReason.trim() &&
              learning.challenge(observation.id, challengeReason.trim())
            ) {
              setChallengeOpen(false);
              setChallengeReason("");
            }
          }}
        >
          <p>
            This immediately excludes the observation and its linked rating from
            active estimates. The original answer remains in your history. A
            provider has not reviewed the challenge.
          </p>
          <label className={styles.label}>
            What should be reconsidered?
            <textarea
              className={styles.editor}
              rows={3}
              maxLength={1_000}
              value={challengeReason}
              onChange={(event) => setChallengeReason(event.target.value)}
              required
            />
          </label>
          <div className={styles.actions}>
            <button
              className="button primary"
              disabled={!challengeReason.trim()}
            >
              Exclude this observation
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setChallengeOpen(false)}
            >
              Keep current result
            </button>
          </div>
        </form>
      </Modal>
    </Shell>
  );
}
