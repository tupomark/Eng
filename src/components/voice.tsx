"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Mic, Pause, Play } from "lucide-react";
import { Orb } from "./orb";
export function Voice() {
  const [active, setActive] = useState(false);
  return (
    <main className="voice-workspace">
      <header className="voice-header">
        <Link href="/" className="text-link">
          <ArrowLeft size={17} />
          Back to your space
        </Link>
        <span className="voice-brand">
          LEXIS <span>/ VOICE</span>
        </span>
        <span className="pill">Visual concept</span>
      </header>
      <div className="voice-content">
        <p className="eyebrow">YOUR VOICE HAS ROOM HERE</p>
        <h1>
          A thought.
          <br />A breath. A beginning.
        </h1>
        <p className="voice-description">A softer space to find the words.</p>
        <div className="voice-stage">
          <Orb variant="voice" active={active} />
        </div>
        <p className="voice-state" role="status">
          {active
            ? "A moment in motion."
            : "A quiet moment, ready when you are."}
        </p>
        <button
          className="button voice-button"
          onClick={() => setActive((value) => !value)}
        >
          {active ? <Pause size={16} /> : <Play size={16} />}
          {active ? "Pause animation" : "Preview animation"}
        </button>
        <p className="voice-disclosure">
          <Mic size={14} />
          This is a visual prototype. It does not record, listen or assess
          speech.
        </p>
      </div>
      <footer className="voice-footer">
        <span>EXPRESS YOURSELF, AT YOUR OWN PACE.</span>
        <Link href="/reader" className="text-link">
          Begin with a reading
          <ArrowRight size={15} />
        </Link>
      </footer>
    </main>
  );
}
