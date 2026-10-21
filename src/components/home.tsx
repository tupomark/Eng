"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Layers3,
  Sparkles,
  Clock3,
} from "lucide-react";
import { dueSenses, deriveProgress } from "@/domain";
import { Shell } from "./shell";
import { Orb } from "./orb";
import { useLearning } from "./learning-provider";

export function Home() {
  const { state, ready } = useLearning();
  const due = dueSenses(state, new Date()).length;
  const evidence = state.evidence.filter((item) => !item.disputedAt);
  const skills = new Set(
    deriveProgress(state)
      .filter((item) => item.attempts > 0)
      .map((item) => item.skill),
  ).size;
  return (
    <Shell title="Home">
      <div className="home-heading">
        <div>
          <p className="eyebrow">
            <Sparkles size={15} className="small-star" aria-hidden="true" /> A
            LITTLE SPACE FOR POSSIBILITY
          </p>
          <h1>
            A language,
            <br />
            <span>becoming yours.</span>
          </h1>
          <p className="intro-copy">
            Make a little room for English. See where it takes you.
          </p>
        </div>
        <div className="chapter-label">
          <span>YOUR NEXT CHAPTER</span>
          <i />
          <span>ONE ENCOUNTER AT A TIME</span>
        </div>
      </div>
      <section className="home-grid" aria-label="Your learning overview">
        <Link href="/core" className="living-core-card">
          <div className="card-label">
            <span className="light-dot" />
            LIVING CORE
            <ArrowUpRight size={19} />
          </div>
          <div className="core-visual">
            <Orb />
          </div>
          <div className="core-copy">
            <p className="tiny">CONNECTED BY UNDERSTANDING</p>
            <h2>
              Every encounter
              <br />
              leaves a trace.
            </h2>
            <p>
              Your meanings. Your skills. A fuller picture
              <br className="desktop-only" /> of the English that is becoming
              yours.
            </p>
          </div>
          <div className="core-card-footer">
            <span>
              <i />
              {state.saved.length
                ? `${state.saved.length} meanings taking shape`
                : "Your first connection is waiting"}
            </span>
            <span className="circle-arrow">
              <ArrowRight size={17} />
            </span>
          </div>
        </Link>
        <div className="continue-card glass-panel">
          <div className="card-label">
            <BookOpen size={16} />
            PICK UP A NEW PERSPECTIVE
            <span className="label-end">
              {Math.min(3, Math.round(state.readerProgress / (100 / 3)) + 1)
                .toString()
                .padStart(2, "0")}{" "}
              / 03
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
                THE ART
                <br />
                OF NOTICING
              </small>
            </div>
            <div>
              <p className="eyebrow">THE EVERYDAY COLLECTION</p>
              <h2>
                The art of
                <br />
                noticing
              </h2>
              <p>A slower look at an ordinary day.</p>
              <div className="reading-meta">
                <span>Original reading</span>
                <span>3 short parts</span>
              </div>
            </div>
          </div>
          <div className="reading-progress">
            <span>
              {state.readerProgress
                ? `${Math.round(state.readerProgress)}% explored`
                : "A fresh page, just for you"}
            </span>
            <span>
              <Clock3 size={12} /> 3 min read
            </span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${state.readerProgress}%` }} />
          </div>
          <Link className="button dark" href="/reader">
            {state.readerProgress > 0 ? "Continue reading" : "Start reading"}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="daily-review glass-panel">
          <div className="review-icon">
            <Layers3 size={23} strokeWidth={1.4} />
          </div>
          <div className="daily-review-copy">
            <p className="eyebrow">SMART REVIEW</p>
            <h2>
              {due
                ? `${due} ${due === 1 ? "meaning" : "meanings"} to revisit`
                : "A little practice. A lasting trace."}
            </h2>
            <p>
              {due
                ? "Bring a familiar meaning a little closer."
                : "Save a meaning as you read. Find it here when it’s time."}
            </p>
          </div>
          <Link
            className="round-link"
            href="/learn"
            aria-label="Open Smart Review"
          >
            <ArrowUpRight size={22} />
          </Link>
        </div>
      </section>
      <section className="lower-grid">
        <div className="progress-panel">
          <div className="section-heading">
            <h2>Your story so far</h2>
            <Link href="/core" className="text-link">
              Explore your Core
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="stat-row">
            <div>
              <span className="stat-number">
                {ready ? state.saved.length.toString().padStart(2, "0") : "—"}
                <small>meanings</small>
              </span>
              <span>Collected with context</span>
            </div>
            <div>
              <span className="stat-number">
                {ready ? evidence.length.toString().padStart(2, "0") : "—"}
                <small>encounters</small>
              </span>
              <span>Reviewed and reflected on</span>
            </div>
            <div>
              <span className="stat-number">
                {ready ? skills.toString().padStart(2, "0") : "—"}
                <small>of 5 skills</small>
              </span>
              <span>With practice evidence</span>
            </div>
          </div>
          <p className="progress-note">
            <Sparkles size={14} /> Progress starts with an encounter, not a
            perfect score.
          </p>
        </div>
        <Link href="/tutor" className="voice-teaser">
          <div>
            <p className="eyebrow">A SPACE TO SPEAK</p>
            <h2>Find your voice.</h2>
            <p>
              Meet the softer side
              <br />
              of speaking practice.
            </p>
            <span className="text-link">
              Explore the concept
              <ArrowUpRight size={14} />
            </span>
          </div>
          <Orb variant="voice" />
          <span className="prototype-tag">VISUAL CONCEPT</span>
        </Link>
      </section>
    </Shell>
  );
}
