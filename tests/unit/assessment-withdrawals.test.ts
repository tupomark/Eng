import { expect, it } from "vitest";
import {
  ASSESSMENT_WITHDRAWAL_POLICIES,
  applyAssessmentWithdrawals,
} from "@/application/assessment-withdrawals";
import { TaskSession, taskSchedules } from "@/application/task-session";
import {
  BrowserTaskRepository,
  TASK_STORAGE_KEY,
} from "@/infrastructure/storage/browser-task-repository";
import { taskObservations, parseTaskLearningState } from "@/domain/tasks/state";
import { summarizeTaskObservations } from "@/domain/tasks/engine";
import { sampleListeningTask } from "@/infrastructure/listening/sample-task";

class Memory implements Storage {
  data = new Map<string, string>();
  fail = false;
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("quota");
    this.data.set(key, value);
  }
}
function history() {
  const storage = new Memory();
  let now = "2026-10-24T10:00:00.000Z";
  let counter = 0;
  const session = new TaskSession(new BrowserTaskRepository(storage), {
    now: () => now,
    createId: () => `attempt-${++counter}`,
  });
  session.load();
  const old = {
    ...sampleListeningTask(),
    id: "listening:original-coast:location",
    version: "original-coast-v1",
    promptFamily: "heard-context-location",
    rubricVersion: "original-listening-location-v1",
    prompt: "Where do the people stay for a while?",
    acceptedAnswers: ["by the sea"],
    explanation: "They are by the sea.",
  };
  const first = session.startTask(old);
  session.submitTask(first.id, "by the sea");
  const item = session.state!.reviewItems[0];
  session.recordRating(item.id, "good", first.id);
  const before = JSON.stringify({
    task: session.state!.tasks[0],
    attempt: session.state!.attempts[0],
  });
  const originalBackup = storage.getItem(TASK_STORAGE_KEY)!;
  for (let index = 0; index < 2; index++) {
    now = `2026-10-${25 + index}T10:00:00.000Z`;
    const valid = {
      ...sampleListeningTask(),
      id: `valid-listening-${index}`,
      promptFamily: old.promptFamily,
    };
    const attempt = session.startTask(valid);
    session.submitTask(attempt.id, "staying for a while");
    session.recordRating(item.id, index === 0 ? "good" : "again", attempt.id);
  }
  return { storage, session, item, first, before, originalBackup };
}
it("a versioned policy withdraws old off-target evidence and replays later ratings without editing the audit", () => {
  const { session, item, first, before } = history();
  const original = session.state!;
  const corrected = session.reconcileAssessmentPolicies(
    ASSESSMENT_WITHDRAWAL_POLICIES,
  );
  expect(
    JSON.stringify({
      task: corrected.tasks[0],
      attempt: corrected.attempts[0],
    }),
  ).toBe(before);
  expect(corrected.challenges).toMatchObject([
    {
      initiator: "assessment-policy",
      policyId: "listening-location-target-mismatch-v1",
      observationId: `observation:${first.id}`,
    },
  ]);
  expect(taskObservations(corrected)).toHaveLength(3); // Original is auditable, not deleted.
  expect(
    summarizeTaskObservations(
      item.target,
      "listening",
      taskObservations(corrected),
      corrected.challenges,
    ).observations,
  ).toBe(2);
  const expected = taskSchedules({
    ...original,
    scheduleEvents: original.scheduleEvents.filter(
      (event) => event.kind !== "rating" || event.attemptId !== first.id,
    ),
  });
  expect(
    taskSchedules(corrected).map((item) => ({
      card: item.card,
      logs: item.logs,
    })),
  ).toEqual(expected.map((item) => ({ card: item.card, logs: item.logs })));
  expect(
    session.reconcileAssessmentPolicies(ASSESSMENT_WITHDRAWAL_POLICIES),
  ).toEqual(corrected);
  expect(corrected.challenges).toHaveLength(1);
  expect(corrected.archivedItemIds).not.toContain(item.id);
  expect(parseTaskLearningState(JSON.parse(JSON.stringify(corrected)))).toEqual(
    corrected,
  );
});
it("failed persistence still has a safe projection; retry and old-backup merge cannot reactivate the event", () => {
  const { session, storage, item, originalBackup } = history();
  const bytes = storage.getItem(TASK_STORAGE_KEY);
  storage.fail = true;
  expect(() =>
    session.reconcileAssessmentPolicies(ASSESSMENT_WITHDRAWAL_POLICIES),
  ).toThrow("quota");
  expect(storage.getItem(TASK_STORAGE_KEY)).toBe(bytes);
  const safe = applyAssessmentWithdrawals(
    session.state!,
    ASSESSMENT_WITHDRAWAL_POLICIES,
  );
  expect(
    summarizeTaskObservations(
      item.target,
      "listening",
      taskObservations(safe),
      safe.challenges,
    ).observations,
  ).toBe(2);
  storage.fail = false;
  const corrected = session.reconcileAssessmentPolicies(
    ASSESSMENT_WITHDRAWAL_POLICIES,
  );
  const preview = session.previewRestore(originalBackup);
  session.confirmRestore(preview);
  expect(
    session.reconcileAssessmentPolicies(ASSESSMENT_WITHDRAWAL_POLICIES)
      .challenges,
  ).toEqual(corrected.challenges);
  expect(session.state!.scheduleExclusions).toEqual(
    corrected.scheduleExclusions,
  );
});
it("legacy learner challenges keep their source and are not relabelled as policy decisions", () => {
  const { session, first } = history();
  session.challenge(`observation:${first.id}`, "My own challenge");
  const original = session.state!.challenges[0];
  session.reconcileAssessmentPolicies(ASSESSMENT_WITHDRAWAL_POLICIES);
  expect(session.state!.challenges).toEqual([original]);
  const malformed = {
    ...session.state!,
    challenges: [{ ...original, initiator: "assessment-policy" }],
  };
  expect(() => parseTaskLearningState(malformed)).toThrow("policy identity");
});

it("retires an objective whose only assessment was withdrawn, without erasing its original answer", () => {
  const { originalBackup, item } = history();
  const original = parseTaskLearningState(JSON.parse(originalBackup));
  const corrected = applyAssessmentWithdrawals(
    original,
    ASSESSMENT_WITHDRAWAL_POLICIES,
  );
  expect(corrected.archivedItemIds).toContain(item.id);
  expect(corrected.attempts).toEqual(original.attempts);
  expect(corrected.tasks).toEqual(original.tasks);
  expect(
    summarizeTaskObservations(
      item.target,
      "listening",
      taskObservations(corrected),
      corrected.challenges,
    ).status,
  ).toBe("insufficient-data");
  expect(
    applyAssessmentWithdrawals(corrected, ASSESSMENT_WITHDRAWAL_POLICIES),
  ).toBe(corrected);
});
