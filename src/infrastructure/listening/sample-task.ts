import type { TaskDefinition } from "@/domain/tasks";
import { seedEntries } from "@/infrastructure/dictionary/seed";
import { LISTENING_SAMPLE_ID } from "./media-repository";

export const SAMPLE_TRANSCRIPT =
  "We linger by the sea. A quiet path leads beneath the trees.";
export function sampleListeningTask(): TaskDefinition {
  const sense = seedEntries.find((entry) => entry.lexeme.lemma === "linger")!
    .senses[0];
  return {
    id: "listening:original-coast:linger-meaning",
    version: "original-coast-task-v2",
    target: { kind: "sense", senseId: sense.id },
    skill: "listening",
    format: "listening-comprehension",
    promptFamily: "heard-sense-action",
    prompt:
      "In the first sentence, what are the people doing? Choose the action you heard.",
    acceptedAnswers: ["staying for a while"],
    explanation:
      "The speaker says: We linger by the sea. Here linger means to stay for a while rather than leave immediately. This closed task observes recognition of that specific meaning from this recording; one answer does not establish general listening ability or pronunciation.",
    rubricVersion: "original-listening-action-meaning-v2",
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
