import { describe, expect, it } from "vitest";
import { emptyState, reviewSense, saveSense } from "../../src/domain";
import {
  beginTask,
  evaluateClosedTask,
  finishTask,
  revealTaskHelp,
  submitTask,
  type TaskDefinition,
} from "../../src/domain/tasks";
import { emptyTaskLearningState } from "../../src/domain/tasks/state";
import {
  buildObservationTrail,
  confirmedMistakePatterns,
  filterObservationTrail,
  rollingObservationWindow,
  summarizeObservatory,
} from "../../src/domain/knowledge/observatory";
import {
  addGoal,
  emptyGoalState,
  goalProgress,
  parseGoalState,
  previewGoalRestore,
  reviseGoal,
  suggestGoalLoad,
  type LearningGoal,
} from "../../src/domain/knowledge/goals";
import { senseConnections } from "../../src/domain/knowledge/network";
import { EDITORIAL_RELATIONS } from "../../src/infrastructure/dictionary/editorial-relations";
import { seedEntries } from "../../src/infrastructure/dictionary/seed";
import {
  BrowserGoalRepository,
  GOALS_STORAGE_KEY,
} from "../../src/infrastructure/storage/browser-goals";

const NOW = "2026-10-24T12:00:00.000Z";
const task: TaskDefinition = {
  id: "grammar-present-perfect",
  version: "1",
  target: { kind: "grammar", conceptId: "present-perfect" },
  skill: "grammar",
  format: "grammar-choice",
  promptFamily: "grammar-recall",
  prompt: "I ___ finished.",
  acceptedAnswers: ["have"],
  explanation: "Use have with I.",
  rubricVersion: "editorial-v1",
  evaluator: "deterministic",
  hints: [{ id: "hint", text: "Use the auxiliary have." }],
  source: {
    provider: "LEXIS",
    version: "fixture-v1",
    rights: "Original authored fixture",
    kind: "editorial",
  },
};
function completed(id: string, answer: string, helped = false) {
  let attempt = beginTask(task, id, NOW);
  if (helped)
    attempt = revealTaskHelp(
      task,
      attempt,
      { kind: "hint", hintId: "hint" },
      NOW,
    );
  const submitted = submitTask(task, attempt, answer, NOW);
  return finishTask(task, submitted, evaluateClosedTask(task, submitted));
}
function fixture() {
  const legacy = reviewSense(
    saveSense(emptyState(), "outside-seed", "private context", NOW),
    "outside-seed",
    "again",
    NOW,
    "legacy-id",
  );
  const state = {
    ...emptyTaskLearningState(),
    tasks: [task],
    attempts: [
      completed("good", "have"),
      completed("error-a", "has"),
      completed("error-b", "has"),
      completed("helped", "has", true),
      completed("disputed", "have"),
    ],
    challenges: [
      {
        id: "challenge",
        observationId: "observation:disputed",
        challengedAt: NOW,
        reason: "Ambiguous prompt",
      },
    ],
  };
  return { legacy, state, rows: buildObservationTrail(legacy, state) };
}
const goal: LearningGoal = {
  id: "goal-1",
  title: "Use everyday grammar",
  term: "short",
  domain: "Everyday life",
  skill: "grammar",
  measure: "independent-attempts",
  targetCount: 8,
  cadence: "7-days",
  createdAt: "2026-10-23T12:00:00.000Z",
  updatedAt: "2026-10-23T12:00:00.000Z",
  revision: 1,
  archived: false,
};

describe("evidence-grounded observatory", () => {
  it("separates self reports, independent tasks, assistance and disputes without duplicate scheduler credit", () => {
    const { rows } = fixture();
    expect(summarizeObservatory(rows)).toMatchObject({
      selfReports: 1,
      taskObservations: 4,
      independent: 3,
      assisted: 1,
      independentAccepted: 1,
      independentNotYet: 2,
      excluded: 1,
    });
    expect(summarizeObservatory([...rows, ...rows])).toEqual(
      summarizeObservatory(rows),
    );
    expect(
      summarizeObservatory(rows).skills.find(
        (entry) => entry.skill === "speaking",
      ),
    ).toMatchObject({ status: "insufficient-data", independent: 0 });
    expect(
      summarizeObservatory(rows).skills.find(
        (entry) => entry.skill === "recognition",
      ),
    ).toMatchObject({ selfReports: 1, status: "insufficient-data" });
  });
  it("filters exact skill, target, UTC window and keeps excluded audit explicit", () => {
    const { rows } = fixture();
    expect(
      filterObservationTrail(rows, {
        skill: "grammar",
        target: task.target,
        from: NOW,
        until: NOW,
      }),
    ).toHaveLength(4);
    expect(
      filterObservationTrail(rows, { skill: "grammar", includeExcluded: true }),
    ).toHaveLength(5);
    expect(
      filterObservationTrail(rows, { from: "2026-10-24T12:00:00.001Z" }),
    ).toEqual([]);
    expect(() =>
      filterObservationTrail(rows, {
        from: "2026-10-25T00:00:00.000Z",
        until: NOW,
      }),
    ).toThrow("reversed");
    expect(rollingObservationWindow(NOW, 7)).toEqual({
      from: "2026-10-17T12:00:00.000Z",
      until: NOW,
    });
  });
  it("creates a repeated pattern only from independent unchallenged not-yet tasks", () => {
    const { rows } = fixture();
    expect(confirmedMistakePatterns(rows)).toMatchObject([
      { skill: "grammar", count: 2, target: task.target },
    ]);
    const challenged = rows.map((row) =>
      row.id === "observation:error-a" ? { ...row, excluded: true } : row,
    );
    expect(confirmedMistakePatterns(challenged)).toEqual([]);
    expect(confirmedMistakePatterns(rows, { skill: "recognition" })).toEqual(
      [],
    );
  });
  it("empty data creates no measured skill or invented pattern", () => {
    const rows = buildObservationTrail(emptyState(), emptyTaskLearningState());
    expect(
      summarizeObservatory(rows).skills.every(
        (skill) => skill.status === "insufficient-data",
      ),
    ).toBe(true);
    expect(confirmedMistakePatterns(rows)).toEqual([]);
  });
});

describe("goals follow declared intent and actual observations", () => {
  it("counts independent eligible attempts separately from accepted outcomes", () => {
    const { rows } = fixture();
    expect(goalProgress(goal, rows, NOW)).toMatchObject({
      count: 3,
      target: 8,
      measure: "independent-attempts",
    });
    expect(
      goalProgress({ ...goal, measure: "independent-accepted" }, rows, NOW)
        .count,
    ).toBe(1);
    expect(goalProgress({ ...goal, skill: "speaking" }, rows, NOW).count).toBe(
      0,
    );
    expect(
      goalProgress(
        { ...goal, createdAt: "2026-10-25T00:00:00.000Z" },
        rows,
        NOW,
      ),
    ).toMatchObject({ count: 0, clockIssue: true });
  });
  it("uses exact rolling boundaries, never a fabricated streak", () => {
    const { rows } = fixture();
    const weekLater = "2026-10-31T12:00:00.000Z";
    expect(goalProgress(goal, rows, weekLater).count).toBe(3);
    expect(goalProgress(goal, rows, "2026-10-31T12:00:00.001Z").count).toBe(0);
    expect(
      goalProgress(
        { ...goal, cadence: "since-start" },
        rows,
        "2026-11-30T12:00:00.000Z",
      ).count,
    ).toBe(3);
  });
  it("offers a transparent local suggestion without changing a plan until explicitly revised", () => {
    const { rows } = fixture();
    const state = addGoal(emptyGoalState(), goal);
    const suggestion = suggestGoalLoad(goal, rows, NOW)!;
    expect(suggestion).toMatchObject({
      expectedRevision: 1,
      proposedTarget: 6,
      policyVersion: "local-goal-load-v1",
    });
    expect(state.goals[0]?.targetCount).toBe(8);
    const changed = reviseGoal(
      state,
      goal.id,
      suggestion.expectedRevision,
      { targetCount: suggestion.proposedTarget },
      NOW,
    );
    expect(changed.goals[0]).toMatchObject({ targetCount: 6, revision: 2 });
    expect(() =>
      reviseGoal(changed, goal.id, 1, { targetCount: 4 }, NOW),
    ).toThrow("changed after");
    expect(
      suggestGoalLoad(
        goal,
        rows.map((row) => ({ ...row, excluded: true })),
        NOW,
      ),
    ).toBeNull();
  });
  it("round trips goals and previews restore without silently merging conflicting revisions", () => {
    const state = addGoal(emptyGoalState(), goal);
    const copy = JSON.parse(JSON.stringify(state));
    expect(parseGoalState(copy)).toEqual(state);
    expect(previewGoalRestore(emptyGoalState(), copy)).toMatchObject({
      incoming: 1,
      added: 1,
      state,
    });
    expect(previewGoalRestore(state, copy).added).toBe(0);
    expect(() =>
      previewGoalRestore(state, {
        ...copy,
        goals: [{ ...goal, targetCount: 7 }],
      }),
    ).toThrow("conflicts");
    expect(() =>
      parseGoalState({ ...copy, goals: [{ ...goal, skill: "fluency" }] }),
    ).toThrow("Unknown");
    expect(() =>
      parseGoalState({ ...copy, goals: [{ ...goal, title: "" }] }),
    ).toThrow("Goal text");
  });
});

describe("small warranted semantic network", () => {
  it("links existing senses with typed explanation, source and no invented synonymy", () => {
    const ids = new Set(
      seedEntries.flatMap((entry) => entry.senses.map((sense) => sense.id)),
    );
    expect(
      EDITORIAL_RELATIONS.every(
        (edge) =>
          ids.has(edge.fromSenseId) &&
          ids.has(edge.toSenseId) &&
          edge.explanation.length > 30 &&
          edge.provenance.rights.length > 0,
      ),
    ).toBe(true);
    expect(senseConnections(EDITORIAL_RELATIONS, "linger-stay")).toMatchObject([
      { id: "linger-polysemy", type: "sense-contrast" },
    ]);
    expect(
      senseConnections(EDITORIAL_RELATIONS, "linger-stay", { type: "synonym" }),
    ).toEqual([]);
  });
  it("filters source and saved contexts, keeping proposals visibly unverified", () => {
    expect(
      senseConnections(EDITORIAL_RELATIONS, "linger-remain", {
        source: "user",
      }),
    ).toEqual([]);
    expect(
      senseConnections(EDITORIAL_RELATIONS, "linger-remain", {
        savedSenseIds: [],
      }),
    ).toEqual([]);
    expect(
      senseConnections(EDITORIAL_RELATIONS, "linger-remain", {
        savedSenseIds: ["trace-mark"],
      }),
    ).toHaveLength(1);
    const proposal = {
      ...EDITORIAL_RELATIONS[0],
      id: "proposal",
      verification: "proposal" as const,
      provenance: { ...EDITORIAL_RELATIONS[0].provenance, kind: "ai" as const },
    };
    expect(
      senseConnections([proposal], "linger-stay", { source: "ai" })[0]
        ?.verification,
    ).toBe("proposal");
  });
});

describe("goal storage errors preserve current data", () => {
  const memory = () => {
    const map = new Map<string, string>();
    let fail = false;
    return {
      storage: {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          if (fail) throw new Error("Quota");
          map.set(key, value);
        },
      } as Storage,
      setFail: (value: boolean) => {
        fail = value;
      },
    };
  };
  it("rejects stale tabs and denied writes without replacing the original backup", () => {
    const { storage, setFail } = memory();
    const repo = new BrowserGoalRepository(storage);
    const a = repo.read();
    const b = repo.read();
    const bytes = repo.commit(addGoal(a.state, goal), a.serialized);
    expect(() =>
      repo.commit(addGoal(b.state, { ...goal, id: "other" }), b.serialized),
    ).toThrow("another tab");
    setFail(true);
    expect(() =>
      repo.commit(
        reviseGoal(repo.read().state, goal.id, 1, { title: "Changed" }, NOW),
        bytes,
      ),
    ).toThrow("Quota");
    expect(storage.getItem(GOALS_STORAGE_KEY)).toBe(bytes);
  });
  it("does not reset unreadable bytes", () => {
    const { storage } = memory();
    storage.setItem(GOALS_STORAGE_KEY, "{corrupt");
    expect(() => new BrowserGoalRepository(storage).read()).toThrow();
    expect(storage.getItem(GOALS_STORAGE_KEY)).toBe("{corrupt");
  });
});
