import type { TaskDefinition, TaskFormat } from "@/domain/tasks";
import { seedEntries } from "./seed";

export const EDITORIAL_FORMATS = [
  "recognition",
  "recall",
  "translation-to-en",
  "own-sentence",
] as const;
export type EditorialFormat = (typeof EDITORIAL_FORMATS)[number];

/** Limited original teaching material, not a claim to full dictionary coverage. */
export function editorialTask(
  senseId: string,
  format: EditorialFormat,
): TaskDefinition | null {
  const entry = seedEntries.find((item) =>
    item.senses.some((sense) => sense.id === senseId),
  );
  const sense = entry?.senses.find((item) => item.id === senseId);
  if (!entry || !sense || !EDITORIAL_FORMATS.includes(format)) return null;
  const prompts: Record<EditorialFormat, string> = {
    recognition: `Choose the definition of “${entry.lexeme.lemma}” in this example: ${sense.example}`,
    recall: `Write the English base form (${entry.lexeme.partOfSpeech}) for this specific meaning: ${sense.definition}`,
    "translation-to-en": `Write the English base form for this meaning: ${sense.translation}. Context: ${sense.example.replace(new RegExp(`\\b${entry.lexeme.lemma}\\w*\\b`, "giu"), "[…] ")}`,
    "own-sentence": `Write an original English sentence using “${entry.lexeme.lemma}” with this meaning: ${sense.definition}`,
  };
  return {
    id: `editorial:${senseId}:${format}`,
    version: "editorial-task-v1",
    target: { kind: "sense", senseId },
    skill:
      format === "recognition"
        ? "recognition"
        : format === "own-sentence"
          ? "writing"
          : "recall",
    format: format as TaskFormat,
    promptFamily:
      format === "recognition"
        ? "meaning-choice"
        : format === "own-sentence"
          ? "independent-sentence"
          : "word-recall",
    prompt: prompts[format],
    acceptedAnswers:
      format === "recognition"
        ? [sense.definition]
        : format === "own-sentence"
          ? []
          : [entry.lexeme.lemma],
    explanation: `${sense.definition} Example: ${sense.example} This task checks only its stated meaning and skill.`,
    rubricVersion: "editorial-closed-v1",
    evaluator: format === "own-sentence" ? "semantic" : "deterministic",
    hints: [
      {
        id: "first-letter",
        text: `The base form begins with “${entry.lexeme.lemma[0]}”.`,
      },
    ],
    source: { ...entry.provenance },
    context: { id: `editorial-example:${senseId}`, excerpt: sense.example },
  };
}

export function recognitionChoices(task: TaskDefinition): string[] {
  const alternatives = seedEntries
    .flatMap((entry) => entry.senses)
    .filter(
      (sense) =>
        sense.id !== (task.target.kind === "sense" ? task.target.senseId : ""),
    )
    .slice(0, 3)
    .map((sense) => sense.definition);
  const choices = [...alternatives, ...task.acceptedAnswers];
  // Stable rotation avoids teaching that the first choice is always correct.
  const offset =
    [...task.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    choices.length;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}
