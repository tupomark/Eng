import { Mic } from "lucide-react";
export function Orb({
  variant = "core",
  active = false,
}: {
  variant?: "core" | "voice";
  active?: boolean;
}) {
  return (
    <div
      className={`orb-scene ${variant} ${active ? "orb-active" : ""}`}
      aria-hidden="true"
    >
      <div className="orb-orbit orbit-one" />
      <div className="orb-orbit orbit-two" />
      <div className="orb">
        <div className="orb-light" />
        <div className="orb-inner" />
        {variant === "voice" && (
          <Mic size={27} strokeWidth={1.2} className="orb-mic" />
        )}
      </div>
      <span className="orb-satellite satellite-one" />
      <span className="orb-satellite satellite-two" />
    </div>
  );
}
