import { describe, expect, it } from "vitest";
import { assertTaskDefinition } from "../../src/domain/tasks";
import { seedEntries } from "../../src/infrastructure/dictionary/seed";
import {
  editorialTask,
  EDITORIAL_FORMATS,
  recognitionChoices,
} from "../../src/infrastructure/dictionary/editorial-tasks";
describe("editorial practice", () => {
  it("uses explicit senses, separated skills and truthful evaluator capabilities", () => {
    for (const entry of seedEntries)
      for (const sense of entry.senses)
        for (const format of EDITORIAL_FORMATS) {
          const task = editorialTask(sense.id, format)!;
          expect(() => assertTaskDefinition(task)).not.toThrow();
          expect(task.target).toEqual({ kind: "sense", senseId: sense.id });
          expect(task.source.kind).toBe("editorial");
          if (format === "own-sentence")
            expect(task.evaluator).toBe("semantic");
          if (format === "recognition")
            expect(
              recognitionChoices(task).filter(
                (answer) => answer === sense.definition,
              ),
            ).toHaveLength(1);
        }
  });
  it("does not invent a task for an unavailable sense", () => {
    expect(editorialTask("missing-original-id", "recall")).toBeNull();
  });
});
