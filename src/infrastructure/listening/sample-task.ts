import type { TaskDefinition } from "@/domain/tasks";
import { seedEntries } from "@/infrastructure/dictionary/seed";
import { LISTENING_SAMPLE_ID } from "./media-repository";

export const SAMPLE_TRANSCRIPT =
  "We linger by the sea. A quiet path leads beneath the trees.";
export function sampleListeningTask(): TaskDefinition {
  const sense = seedEntries.find((entry) => entry.lexeme.lemma === "linger")!
    .senses[0];
  return {
    id: "listening:original-coast:location",
    version: "original-coast-v1",
    target: { kind: "sense", senseId: sense.id },
    skill: "listening",
    format: "listening-comprehension",
    promptFamily: "heard-context-location",
    prompt: "Where do the people stay for a while? Choose the place you heard.",
    acceptedAnswers: [
      "by the sea",
      "near the sea",
      "at the sea",
      "the sea",
      "the seaside",
      "at the seaside",
      "by the coast",
      "on the coast",
      "the coast",
      "near the ocean",
      "by the ocean",
    ].flatMap((answer) => [answer, `${answer}.`]),
    partialAnswers: ["outside", "outdoors"],
    explanation:
      "The recording says they linger by the sea. This short closed task observes comprehension of that location in this recording; it is not a general language level or a pronunciation grade.",
    rubricVersion: "original-listening-location-v1",
    evaluator: "deterministic",
    hints: [],
    source: {
      provider: "LEXIS original text; local Flite synthetic speech",
      version: "original-coast-v1",
      rights:
        "Original LEXIS text and synthetic sample; Flite attribution in /audio/ATTRIBUTION.md",
      kind: "editorial",
    },
    audioSourceId: LISTENING_SAMPLE_ID,
  };
}
