import { describe, expect, it } from "vitest";
import {
  assertTaskDefinition,
  beginTask,
  submitTask,
  evaluateClosedTask,
  finishTask,
  observationFromTask,
  summarizeTaskObservations,
} from "../../src/domain/tasks";
import { USER_LEXICAL_PROVENANCE } from "../../src/domain/lexical-catalog";
import type { LookupDictionaryEntry } from "../../src/application/dictionary-lookup";
import { seedEntries } from "../../src/infrastructure/dictionary/seed";
import {
  editorialTask,
  EDITORIAL_FORMATS,
} from "../../src/infrastructure/dictionary/editorial-tasks";
import {
  catalogTask,
  catalogRecognitionChoices,
} from "../../src/infrastructure/dictionary/catalog-tasks";

const personal: LookupDictionaryEntry = {
  lexeme: {
    id: "user-lexeme-test",
    lemma: "take a rain check",
    partOfSpeech: "phrase",
    ipa: "",
  },
  senses: [
    {
      id: "user-sense-decline",
      lexemeId: "user-lexeme-test",
      definition: "To decline an invitation and suggest a later occasion.",
      translation: "отложить встречу",
      example: "",
      collocations: [],
    },
  ],
  provenance: { ...USER_LEXICAL_PROVENANCE },
};
describe("personal dictionary practice", () => {
  it("keeps editorial task identities and content unchanged", () => {
    expect(
      catalogTask(seedEntries[0], seedEntries[0].senses[0].id, "recall"),
    ).toEqual(editorialTask(seedEntries[0].senses[0].id, "recall"));
  });
  it("uses the exact sense, explicit user answer key and independent skills", () => {
    for (const format of EDITORIAL_FORMATS) {
      const task = catalogTask(personal, personal.senses[0].id, format)!;
      expect(() => assertTaskDefinition(task)).not.toThrow();
      expect(task.target).toEqual({
        kind: "sense",
        senseId: "user-sense-decline",
      });
      expect(task.source.kind).toBe("user");
      expect(task.source.version).toBe(USER_LEXICAL_PROVENANCE.version);
      expect(task.explanation).toContain(
        "does not verify the linguistic accuracy",
      );
      expect(task.skill).toBe(
        format === "recognition"
          ? "recognition"
          : format === "own-sentence"
            ? "writing"
            : "recall",
      );
      if (format === "own-sentence") {
        expect(task.evaluator).toBe("semantic");
        expect(task.acceptedAnswers).toEqual([]);
      }
    }
  });
  it("does not invent translation tasks or replace an unavailable target", () => {
    expect(catalogTask(personal, "missing", "recall")).toBeNull();
    const withoutTranslation = {
      ...personal,
      senses: personal.senses.map((sense) => ({ ...sense, translation: "" })),
    };
    expect(
      catalogTask(
        withoutTranslation,
        personal.senses[0].id,
        "translation-to-en",
      ),
    ).toBeNull();
    expect(
      catalogTask(withoutTranslation, personal.senses[0].id, "recall"),
    ).not.toBeNull();
  });
  it("deduplicates equivalent definitions, retaining one correct control", () => {
    const task = catalogTask(personal, personal.senses[0].id, "recognition")!;
    const duplicate = {
      ...personal,
      senses: [
        {
          ...personal.senses[0],
          id: "user-sense-duplicate",
          definition: ` ${personal.senses[0].definition.toUpperCase()} `,
        },
      ],
    };
    const choices = catalogRecognitionChoices(task, [
      personal,
      duplicate,
      ...seedEntries,
    ]);
    expect(choices).toHaveLength(4);
    expect(
      choices.filter(
        (choice) =>
          choice.toLowerCase().trim() ===
          personal.senses[0].definition.toLowerCase(),
      ),
    ).toHaveLength(1);
    expect(
      catalogRecognitionChoices(task, [personal, duplicate, ...seedEntries]),
    ).toEqual(choices);
  });
  it("records phrase recall through the shared engine with no writing or speaking credit", () => {
    const task = catalogTask(personal, personal.senses[0].id, "recall")!;
    const at = "2026-10-25T10:00:00.000Z";
    const submitted = submitTask(
      task,
      beginTask(task, "own-note-recall", at),
      "Take a rain check",
      at,
    );
    const observation = observationFromTask(
      task,
      finishTask(task, submitted, evaluateClosedTask(task, submitted)),
    )!;
    expect(observation).toMatchObject({
      target: task.target,
      skill: "recall",
      outcome: "accepted",
      independent: true,
      source: { kind: "user" },
    });
    expect(
      summarizeTaskObservations(task.target, "writing", [observation]),
    ).toMatchObject({ status: "insufficient-data", observations: 0 });
    expect(
      summarizeTaskObservations(task.target, "speaking", [observation]),
    ).toMatchObject({ status: "insufficient-data", observations: 0 });
  });
});
