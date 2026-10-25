import type { LookupDictionaryEntry } from "@/application/dictionary-lookup";
import type { TaskDefinition } from "@/domain/tasks";
import { normalizeTaskAnswer } from "@/domain/tasks/engine";
import {
  EDITORIAL_FORMATS,
  editorialTask,
  type EditorialFormat,
} from "./editorial-tasks";

/** User-authored answer keys are practice notes, never verified dictionary facts. */
export function catalogTask(
  entry: LookupDictionaryEntry,
  senseId: string,
  format: EditorialFormat,
): TaskDefinition | null {
  const sense = entry.senses.find((item) => item.id === senseId);
  if (!sense || !EDITORIAL_FORMATS.includes(format)) return null;
  if (entry.provenance.kind === "editorial")
    return editorialTask(senseId, format);
  if (entry.provenance.kind !== "user-authored") return null;
  if (format === "translation-to-en" && !sense.translation.trim()) return null;
  const lemma = entry.lexeme.lemma;
  const prompts: Record<EditorialFormat, string> = {
    recognition: `According to your own note, choose the meaning of “${lemma}” (${entry.lexeme.partOfSpeech}).`,
    recall: `Recall the English headword or phrase (${entry.lexeme.partOfSpeech}) from your own note: ${sense.definition}`,
    "translation-to-en": `Recall the English headword or phrase (${entry.lexeme.partOfSpeech}) from your own translation: ${sense.translation}`,
    "own-sentence": `Write an original English sentence using “${lemma}” with the meaning from your own note: ${sense.definition}`,
  };
  return {
    id: `user-note:${senseId}:${format}`,
    version: `user-note-task-v1:${entry.provenance.version}`,
    target: { kind: "sense", senseId },
    skill:
      format === "recognition"
        ? "recognition"
        : format === "own-sentence"
          ? "writing"
          : "recall",
    format,
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
          : [lemma],
    explanation: `Your note: ${sense.definition} This result checks recall of your own answer key. It does not verify the linguistic accuracy of the note or other skills.`,
    rubricVersion: "user-note-closed-v1",
    evaluator: format === "own-sentence" ? "semantic" : "deterministic",
    hints: [
      {
        id: "first-letter",
        text: `Your headword begins with “${[...lemma][0]}”.`,
      },
    ],
    source: { ...entry.provenance, kind: "user" },
    ...(sense.example
      ? {
          context: {
            id: `user-note-example:${senseId}`,
            excerpt: sense.example,
          },
        }
      : {}),
  };
}

/** Unique alternatives; repeating the author's definition must not create two correct controls. */
export function catalogRecognitionChoices(
  task: TaskDefinition,
  entries: readonly LookupDictionaryEntry[],
): string[] {
  const seen = new Set(
    task.acceptedAnswers.map((value) => normalizeTaskAnswer(value)),
  );
  const alternatives: string[] = [];
  for (const entry of entries) {
    for (const sense of entry.senses) {
      if (task.target.kind === "sense" && sense.id === task.target.senseId)
        continue;
      const key = normalizeTaskAnswer(sense.definition);
      if (!seen.has(key)) {
        alternatives.push(sense.definition);
        seen.add(key);
      }
      if (alternatives.length === 3) break;
    }
    if (alternatives.length === 3) break;
  }
  const answers = task.acceptedAnswers.filter(
    (value, index, all) =>
      all.findIndex(
        (candidate) =>
          normalizeTaskAnswer(candidate) === normalizeTaskAnswer(value),
      ) === index,
  );
  const choices = [...alternatives, ...answers];
  if (!choices.length) return [];
  const offset =
    [...task.id].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    choices.length;
  return [...choices.slice(offset), ...choices.slice(0, offset)];
}
