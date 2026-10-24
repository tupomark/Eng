import { describe, expect, it } from "vitest";
import {
  assertTaskDefinition,
  beginTask,
  evaluateClosedTask,
  finishTask,
  normalizeTaskAnswer,
  observationFromTask,
  revealTaskHelp,
  submitTask,
  summarizeTaskObservations,
  type TaskDefinition,
} from "../../src/domain/tasks";

const NOW = "2026-10-22T12:00:00.000Z";
const source = {
  provider: "LEXIS editorial",
  version: "test-v1",
  rights: "Original authored fixture",
  kind: "editorial" as const,
};
const task: TaskDefinition = {
  id: "recall-colour",
  version: "1",
  target: { kind: "sense", senseId: "colour-hue" },
  skill: "recall",
  format: "translation-to-en",
  promptFamily: "recall",
  prompt: "Translate цвет (the hue of an object).",
  acceptedAnswers: ["colour", "color"],
  partialAnswers: ["hue"],
  explanation:
    "Colour and color are accepted regional spellings for this prompt.",
  rubricVersion: "closed-v1",
  evaluator: "deterministic",
  hints: [{ id: "starts-c", text: "Starts with c." }],
  source,
};
function answer(spec = task, input = "colour", id = "attempt-1") {
  const submitted = submitTask(spec, beginTask(spec, id, NOW), input, NOW);
  return finishTask(spec, submitted, evaluateClosedTask(spec, submitted));
}

describe("shared task engine", () => {
  it("accepts explicitly authored alternatives without changing the measured skill", () => {
    const observation = observationFromTask(task, answer(task, "Color"))!;
    expect(observation).toMatchObject({
      skill: "recall",
      outcome: "accepted",
      independent: true,
      evaluationSource: "deterministic",
    });
    expect(
      summarizeTaskObservations(task.target, "writing", [observation]),
    ).toMatchObject({
      status: "insufficient-data",
      observations: 0,
      lastObservedAt: null,
    });
  });

  it("does not erase meaning-changing words or punctuation during normalization", () => {
    expect(normalizeTaskAnswer("  I  did not go. ")).toBe("i did not go.");
    expect(normalizeTaskAnswer("don't")).not.toBe(normalizeTaskAnswer("dont"));
    expect(normalizeTaskAnswer("cafe\u0301")).toBe(normalizeTaskAnswer("café"));
    expect(answer(task, "not colour").evaluation?.outcome).toBe("not-yet");
  });

  it("retains partial outcomes separately", () => {
    expect(answer(task, "hue").evaluation?.outcome).toBe("partial");
  });

  it("records help explicitly without claiming independence", () => {
    const helped = revealTaskHelp(
      task,
      beginTask(task, "helped", NOW),
      { kind: "hint", hintId: "starts-c" },
      NOW,
    );
    expect(
      revealTaskHelp(task, helped, { kind: "hint", hintId: "starts-c" }, NOW),
    ).toBe(helped);
    const submitted = submitTask(task, helped, "colour", NOW);
    const observation = observationFromTask(
      task,
      finishTask(task, submitted, evaluateClosedTask(task, submitted)),
    )!;
    expect(observation.independent).toBe(false);
    expect(observation.assistance.hintIds).toEqual(["starts-c"]);
    expect(
      summarizeTaskObservations(task.target, "recall", [observation]),
    ).toMatchObject({ assisted: 1, independentObservations: 0 });
  });

  it("answer reveal and accepted corrections never produce independent competence evidence", () => {
    const revealed = revealTaskHelp(
      task,
      beginTask(task, "revealed", NOW),
      { kind: "answer" },
      NOW,
    );
    const submitted = submitTask(task, revealed, "colour", NOW);
    const completed = finishTask(
      task,
      submitted,
      evaluateClosedTask(task, submitted),
    );
    expect(completed.evaluation?.reason).toBe("answer-revealed");
    expect(observationFromTask(task, completed)).toBeNull();
    expect(
      observationFromTask(task, {
        ...answer(),
        assistance: { hintIds: [], acceptedCorrection: true },
      }),
    ).toBeNull();
  });

  it("abstains on ambiguous prompts and absent semantic providers", () => {
    expect(answer({ ...task, ambiguous: true }).evaluation).toMatchObject({
      outcome: "uncertain",
      reason: "ambiguous-prompt",
    });
    const open: TaskDefinition = {
      ...task,
      skill: "writing",
      format: "own-sentence",
      evaluator: "semantic",
      acceptedAnswers: [],
      prompt: "Write your own sentence.",
    };
    const result = answer(open, "The colour is vivid.");
    expect(result.evaluation).toMatchObject({
      outcome: "uncertain",
      reason: "evaluator-unavailable",
    });
    expect(observationFromTask(open, result)).toBeNull();
  });

  it("keeps grammar evidence on its concept without lexical cross-credit", () => {
    const grammar: TaskDefinition = {
      ...task,
      target: { kind: "grammar", conceptId: "present-perfect" },
      skill: "grammar",
      format: "grammar-choice",
      acceptedAnswers: ["have"],
      prompt: "I ___ finished.",
    };
    const observation = observationFromTask(grammar, answer(grammar, "have"))!;
    expect(
      summarizeTaskObservations(grammar.target, "grammar", [observation]),
    ).toMatchObject({ observations: 1, accepted: 1 });
    expect(
      summarizeTaskObservations(task.target, "recall", [observation])
        .observations,
    ).toBe(0);
    expect(() =>
      assertTaskDefinition({ ...grammar, skill: "recognition" }),
    ).toThrow("Grammar concepts");
  });

  it("distinguishes transcript-assisted listening and cannot use ASR as pronunciation scoring", () => {
    const listening: TaskDefinition = {
      ...task,
      format: "listening-comprehension",
      skill: "listening",
      audioSourceId: "legal-audio-1",
    };
    const withTranscript = revealTaskHelp(
      listening,
      beginTask(listening, "listening-1", NOW),
      { kind: "transcript" },
      NOW,
    );
    const submitted = submitTask(listening, withTranscript, "colour", NOW);
    const observation = observationFromTask(
      listening,
      finishTask(
        listening,
        submitted,
        evaluateClosedTask(listening, submitted),
      ),
    )!;
    expect(observation).toMatchObject({
      skill: "listening",
      independent: false,
      modality: "audio-output",
    });
    expect(() =>
      assertTaskDefinition({
        ...task,
        format: "pronunciation",
        skill: "pronunciation",
        evaluator: "semantic",
      }),
    ).toThrow("specialized");
    expect(() =>
      assertTaskDefinition({ ...listening, audioSourceId: undefined }),
    ).toThrow("Playable");
  });

  it("makes delivery idempotent and rejects a conflicting answer or old revision", () => {
    const completed = answer();
    expect(submitTask(task, completed, "colour", NOW)).toBe(completed);
    expect(() => submitTask(task, completed, "color", NOW)).toThrow(
      "different answer",
    );
    expect(() =>
      submitTask({ ...task, version: "2" }, completed, "colour", NOW),
    ).toThrow("revision");
    expect(() =>
      revealTaskHelp(task, completed, { kind: "answer" }, NOW),
    ).toThrow("submitted");
  });

  it("deduplicates observations and replays all dependent counts after challenge", () => {
    const first = observationFromTask(task, answer(task, "wrong", "first"))!;
    const second = observationFromTask(task, answer(task, "colour", "second"))!;
    const third = observationFromTask(task, answer(task, "colour", "third"))!;
    expect(
      summarizeTaskObservations(task.target, "recall", [
        first,
        second,
        third,
        third,
      ]),
    ).toMatchObject({ observations: 3, accepted: 2, notYet: 1 });
    expect(
      summarizeTaskObservations(
        task.target,
        "recall",
        [third, first, second],
        [
          {
            id: "challenge-1",
            observationId: first.id,
            challengedAt: NOW,
            reason: "The task was ambiguous.",
          },
        ],
      ),
    ).toMatchObject({ observations: 2, accepted: 2, notYet: 0 });
    expect(() =>
      summarizeTaskObservations(task.target, "recall", [
        first,
        { ...first, outcome: "accepted" },
      ]),
    ).toThrow("conflicting");
  });

  it("rejects invalid times, unsupported skill/format and unbounded tasks", () => {
    expect(() => beginTask(task, "bad", "2026-02-30T00:00:00Z")).toThrow(
      "calendar",
    );
    expect(() =>
      submitTask(
        task,
        beginTask(task, "clock", NOW),
        "colour",
        "2026-10-21T12:00:00.000Z",
      ),
    ).toThrow("predate");
    expect(() => assertTaskDefinition({ ...task, skill: "speaking" })).toThrow(
      "cannot measure",
    );
    expect(() =>
      assertTaskDefinition({ ...task, acceptedAnswers: [] }),
    ).toThrow("explicit");
    expect(() =>
      assertTaskDefinition({ ...task, prompt: "x".repeat(8_001) }),
    ).toThrow("8");
  });
});
