"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import type { VoicePreviewState } from "@/domain/voice-preview";

export function Orb({
  variant = "core",
  active = false,
  state,
}: {
  variant?: "core" | "voice";
  active?: boolean;
  state?: VoicePreviewState;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const visualState = state ?? (active ? "listening" : "idle");
  const motionRequested = state
    ? state !== "paused" && state !== "error"
    : active;

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let inViewport = true;
    const updateVisibility = () => setVisible(!document.hidden && inViewport);
    updateVisibility();
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            inViewport = entry?.isIntersecting ?? false;
            updateVisibility();
          });
    observer?.observe(element);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return (
    <div
      ref={scene}
      className={`orb-scene ${variant}`}
      data-voice-state={visualState}
      data-motion={motionRequested && visible ? "running" : "paused"}
      aria-hidden="true"
    >
      <div className="orb-form">
        <span className="membrane membrane-one" />
        <span className="membrane membrane-two" />
        <span className="membrane membrane-three" />
        {variant === "voice" && (
          <span className="orb-symbol">
            <Mic size={26} strokeWidth={1.5} aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
