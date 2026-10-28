import { expect, test } from "@playwright/test";
import {
  TaskSession,
  taskSchedules,
  type TaskSnapshotRepository,
} from "../../src/application/task-session";
import {
  emptyTaskLearningState,
  parseTaskLearningState,
  type TaskLearningState,
} from "../../src/domain/tasks/state";
import { sampleListeningTask } from "../../src/infrastructure/listening/sample-task";

class MemoryRepository implements TaskSnapshotRepository {
  serialized: string | null = null;
  read() {
    return {
      serialized: this.serialized,
      state:
        this.serialized === null
          ? emptyTaskLearningState()
          : parseTaskLearningState(JSON.parse(this.serialized)),
    };
  }
  commit(state: TaskLearningState, expected: string | null): string {
    if (expected !== this.serialized)
      throw new Error("Concurrent fixture mutation.");
    this.serialized = JSON.stringify(parseTaskLearningState(state));
    return this.serialized;
  }
}
function storedHistory() {
  const storage = new MemoryRepository();
  let now = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
  let next = 0;
  const session = new TaskSession(storage, {
    now: () => now,
    createId: () => `browser-attempt-${++next}`,
  });
  session.load();
  const obsolete = {
    ...sampleListeningTask(),
    id: "listening:original-coast:location",
    version: "original-coast-v1",
    promptFamily: "heard-context-location",
    rubricVersion: "original-listening-location-v1",
    prompt: "Where do the people stay for a while?",
    acceptedAnswers: ["by the sea"],
    explanation: "The location in this recording is by the sea.",
  };
  const first = session.startTask(obsolete);
  session.submitTask(first.id, "by the sea");
  const objective = session.state!.reviewItems[0];
  session.recordRating(objective.id, "good", first.id);
  now = new Date(Date.parse(now) + 60 * 60_000).toISOString();
  const valid = {
    ...sampleListeningTask(),
    id: "browser-regression:heard-action",
    promptFamily: obsolete.promptFamily,
  };
  const later = session.startTask(valid);
  session.submitTask(later.id, "staying for a while");
  session.recordRating(objective.id, "good", later.id);
  const state = session.state!;
  const expected = taskSchedules({
    ...state,
    scheduleEvents: state.scheduleEvents.filter(
      (event) => event.kind !== "rating" || event.attemptId !== first.id,
    ),
  })[0].card;
  return {
    serialized: storage.serialized!,
    originalAudit: JSON.stringify({
      tasks: state.tasks,
      attempts: state.attempts,
    }),
    oldObservation: `observation:${first.id}`,
    oldRating: `rating:${first.id}`,
    expected,
  };
}

test("reopening a withdrawn assessment preserves its audit, excludes its grade, replays later review and stays corrected after reload", async ({
  page,
}) => {
  const fixture = storedHistory();
  await page.addInitScript((serialized) => {
    if (localStorage.getItem("lexis.tasks.v1") === null)
      localStorage.setItem("lexis.tasks.v1", serialized);
  }, fixture.serialized);
  await page.goto("/listening");
  await expect(
    page.getByText(
      /An earlier location question was withdrawn because it did not measure the intended word meaning/u,
    ),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("lexis.tasks.v1")!).challenges.length,
      ),
    )
    .toBe(1);
  const correctedBytes = await page.evaluate(() =>
    localStorage.getItem("lexis.tasks.v1")!,
  );
  const corrected = parseTaskLearningState(JSON.parse(correctedBytes));
  expect(
    JSON.stringify({ tasks: corrected.tasks, attempts: corrected.attempts }),
  ).toBe(fixture.originalAudit);
  expect(corrected.challenges).toMatchObject([
    {
      observationId: fixture.oldObservation,
      initiator: "assessment-policy",
      policyId: "listening-location-target-mismatch-v1",
    },
  ]);
  expect(corrected.scheduleExclusions.map((event) => event.eventId)).toEqual([
    fixture.oldRating,
  ]);
  expect(taskSchedules(corrected)[0].card).toEqual(fixture.expected);
  expect(corrected.archivedItemIds).toEqual([]); // The later valid format remains usable.
  await page.goto("/core/observatory");
  await expect(
    page.getByText(
      /1 independent accepted outcomes in this\s+window\.\s+1 excluded observations/u,
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      /1 independent accepted outcomes in this\s+window\.\s+1 excluded observations/u,
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("lexis.tasks.v1")),
  ).toBe(correctedBytes);
});
