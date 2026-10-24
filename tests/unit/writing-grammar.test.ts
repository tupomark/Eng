import { describe, expect, it } from "vitest";
import {
  archiveWritingDraft,
  assertWritingWorkspace,
  createWritingDraft,
  currentWritingRevision,
  emptyWritingWorkspace,
  saveWritingRevision,
  saveWritingView,
  writingContext,
} from "@/domain/writing/workspace";
import {
  GRAMMAR_CONCEPTS,
  grammarConcept,
  writingDifference,
} from "@/domain/writing/grammar";
import {
  beginTask,
  evaluateClosedTask,
  finishTask,
  observationFromTask,
  revealTaskHelp,
  submitTask,
  summarizeTaskObservations,
} from "@/domain/tasks";
import {
  confirmWritingRestore,
  previewWritingRestore,
} from "@/domain/writing/restore";

const now = "2026-10-22T12:00:00.000Z";
const later = "2026-10-22T12:01:00.000Z";
function workspace() {
  return createWritingDraft(emptyWritingWorkspace(), {
    id: "draft-1",
    revisionId: "original",
    title: "A note",
    kind: "email",
    now,
  });
}
function save(
  state = workspace(),
  text = "Original text",
  revisionId = "revision-a",
  baseId = "original",
) {
  return saveWritingRevision(state, {
    draftId: "draft-1",
    revisionId,
    baseId,
    text,
    now: later,
  });
}

describe("private writing revisions", () => {
  it("retains the original and both concurrent versions instead of silently overwriting", () => {
    const first = save();
    const both = save(
      first,
      "A different version from another tab",
      "revision-b",
    );
    expect(both.drafts[0].revisions.map((item) => item.text)).toEqual([
      "",
      "Original text",
      "A different version from another tab",
    ]);
    expect(both.drafts[0].tips).toEqual(["revision-a", "revision-b"]);
    expect(currentWritingRevision(both.drafts[0]).text).toBe("Original text");
  });

  it("requires explicit conflict resolution and keeps both branches in history", () => {
    const conflict = save(save(), "Other text", "revision-b");
    const resolved = saveWritingRevision(conflict, {
      draftId: "draft-1",
      baseId: "revision-b",
      revisionId: "resolution",
      text: "Other text",
      now: later,
      resolve: true,
      expectedTips: conflict.drafts[0].tips,
    });
    expect(resolved.drafts[0].tips).toEqual(["resolution"]);
    expect(currentWritingRevision(resolved.drafts[0]).text).toBe("Other text");
    expect(resolved.drafts[0].revisions).toHaveLength(4);
    expect(resolved.drafts[0].revisions.at(-1)?.origin).toBe("merged");
  });

  it("retries the same revision without duplication and rejects reuse with changed contents", () => {
    const state = save();
    expect(save(state)).toBe(state);
    expect(() => save(state, "Changed payload")).toThrow("revision ID");
    expect(
      saveWritingRevision(state, {
        draftId: "draft-1",
        baseId: "revision-a",
        revisionId: "no-change",
        text: "Original text",
        now: later,
      }),
    ).toBe(state);
  });

  it("rejects a missing base and an earlier device clock without touching history", () => {
    const state = workspace();
    expect(() => save(state, "Text", "new", "missing")).toThrow(
      "original revision",
    );
    expect(() =>
      saveWritingRevision(state, {
        draftId: "draft-1",
        baseId: "original",
        revisionId: "new",
        text: "Text",
        now: "2020-01-01T00:00:00.000Z",
      }),
    ).toThrow("clock");
    expect(state.drafts[0].revisions).toHaveLength(1);
  });

  it("archives reversibly without deleting revisions and blocks accidental edits while archived", () => {
    const state = save();
    const archived = archiveWritingDraft(state, "draft-1", later);
    expect(archived.drafts[0].revisions).toEqual(state.drafts[0].revisions);
    expect(() => save(archived, "New", "new", "revision-a")).toThrow(
      "active draft",
    );
    expect(
      archiveWritingDraft(archived, "draft-1", later, false).drafts[0]
        .archivedAt,
    ).toBeUndefined();
  });

  it("keeps cursor state tied to the matching text revision", () => {
    const state = save();
    const positioned = saveWritingView(state, "draft-1", "revision-a", {
      start: 2,
      end: 7,
      scrollTop: 23,
    });
    expect(positioned.drafts[0].view).toEqual({
      start: 2,
      end: 7,
      scrollTop: 23,
    });
    expect(
      saveWritingView(positioned, "draft-1", "original", {
        start: 0,
        end: 0,
        scrollTop: 0,
      }),
    ).toBe(positioned);
    expect(() =>
      saveWritingView(state, "draft-1", "revision-a", {
        start: 2,
        end: 1_000,
        scrollTop: 0,
      }),
    ).toThrow("cursor");
  });

  it("validates owner, schema, revision ancestry and content bounds before a write", () => {
    const state = save();
    expect(() => assertWritingWorkspace(state, "another-profile")).toThrow(
      "another profile",
    );
    expect(() => assertWritingWorkspace({ ...state, version: 2 })).toThrow(
      "safely",
    );
    expect(() =>
      assertWritingWorkspace({
        ...state,
        drafts: [{ ...state.drafts[0], headId: "missing" }],
      }),
    ).toThrow("current writing");
    expect(() =>
      save(state, "x".repeat(100_001), "large", "revision-a"),
    ).toThrow("100000");
  });

  it("shares only the requested bounded excerpt with its exact source revision", () => {
    const state = save(
      workspace(),
      "Мой текст. A thoughtful English sentence. " + "x".repeat(2_000),
    );
    const context = writingContext(state.drafts[0], 11, 2_000, later);
    expect(context).toMatchObject({
      version: 1,
      draftId: "draft-1",
      revisionId: "revision-a",
    });
    expect(context.excerpt).toHaveLength(1_000);
    expect(context.excerpt).not.toContain("Мой текст");
  });
});

describe("authored Grammar Atlas and shared task engine", () => {
  it("accepts both documented hypothetical alternatives without a single-answer penalty", () => {
    const concept = grammarConcept("hypothetical-conditionals")!;
    for (const answer of ["was", "were"]) {
      const attempt = submitTask(
        concept.task,
        beginTask(concept.task, `attempt-${answer}`, now),
        answer,
        later,
      );
      const finished = finishTask(
        concept.task,
        attempt,
        evaluateClosedTask(concept.task, attempt),
      );
      expect(finished.evaluation?.outcome).toBe("accepted");
      expect(observationFromTask(concept.task, finished)).toMatchObject({
        target: { kind: "grammar", conceptId: concept.id },
        skill: "grammar",
        independent: true,
      });
    }
  });

  it("records help as assisted and never turns grammar evidence into lexical recognition", () => {
    const { task } = GRAMMAR_CONCEPTS[0];
    let attempt = beginTask(task, "grammar-assisted", now);
    attempt = revealTaskHelp(
      task,
      attempt,
      { kind: "hint", hintId: "rule-hint" },
      later,
    );
    attempt = submitTask(task, attempt, "has", later);
    attempt = finishTask(task, attempt, evaluateClosedTask(task, attempt));
    const observation = observationFromTask(task, attempt)!;
    expect(observation.independent).toBe(false);
    expect(
      summarizeTaskObservations(
        { kind: "sense", senseId: "linger-stay" },
        "recognition",
        [observation],
      ).observations,
    ).toBe(0);
  });

  it("provides a valid independently gradeable exercise for every authored concept", () => {
    for (const concept of GRAMMAR_CONCEPTS) {
      const attempt = submitTask(
        concept.task,
        beginTask(concept.task, concept.id, now),
        concept.task.acceptedAnswers[0],
        later,
      );
      expect(evaluateClosedTask(concept.task, attempt).outcome).toBe(
        "accepted",
      );
      expect(concept.options).toContain(concept.task.acceptedAnswers[0]);
    }
  });

  it("shows a Unicode revision difference as plain text without rewriting the source", () => {
    const before = "Привет. I has a notebook. 📝";
    const after = "Привет. I have a notebook. 📝";
    const diff = writingDifference(before, after);
    expect(diff.prefix + diff.removed + diff.suffix).toBe(before);
    expect(diff.prefix + diff.added + diff.suffix).toBe(after);
    expect(writingDifference("📝", "📚")).toEqual({
      prefix: "",
      removed: "📝",
      added: "📚",
      suffix: "",
    });
    expect(writingDifference("cafe\u0301", "cafe\u0300")).toEqual({
      prefix: "caf",
      removed: "e\u0301",
      added: "e\u0300",
      suffix: "",
    });
  });
});

describe("writing backup restore", () => {
  it("previews and restores source IDs into a fresh workspace without adding duplicates on retry", () => {
    const source = save();
    const empty = emptyWritingWorkspace();
    const preview = previewWritingRestore(empty, JSON.stringify(source));
    expect(preview).toMatchObject({
      newDrafts: 1,
      newRevisions: 2,
      conflictDraftIds: [],
    });
    expect(empty.drafts).toEqual([]);
    const restored = confirmWritingRestore(empty, preview);
    expect(restored).toEqual(source);
    const repeated = previewWritingRestore(restored, JSON.stringify(source));
    expect(repeated.newDrafts).toBe(0);
    expect(repeated.newRevisions).toBe(0);
    expect(confirmWritingRestore(restored, repeated)).toEqual(restored);
  });

  it("merges divergent histories as explicit branches while retaining the current writing", () => {
    const current = save();
    const incoming = save(
      workspace(),
      "Alternative imported text",
      "revision-b",
    );
    const preview = previewWritingRestore(current, JSON.stringify(incoming));
    expect(preview.conflictDraftIds).toEqual(["draft-1"]);
    const restored = confirmWritingRestore(current, preview);
    expect(restored.drafts[0].tips).toEqual(["revision-a", "revision-b"]);
    expect(currentWritingRevision(restored.drafts[0]).text).toBe(
      "Original text",
    );
    expect(restored.drafts[0].revisions.at(-1)?.text).toBe(
      "Alternative imported text",
    );
  });

  it("rejects malformed/foreign/colliding data and stale confirmation without any write", () => {
    const current = save();
    expect(() => previewWritingRestore(current, "{damaged")).toThrow(
      "readable writing",
    );
    expect(() =>
      previewWritingRestore(
        current,
        JSON.stringify({ ...current, owner: "someone-else" }),
      ),
    ).toThrow("another profile");
    const collision = save(
      workspace(),
      "Different text under the same revision ID",
    );
    expect(() =>
      previewWritingRestore(current, JSON.stringify(collision)),
    ).toThrow("conflicting contents");
    const preview = previewWritingRestore(current, JSON.stringify(current));
    const laterState = save(
      current,
      "A new local edit",
      "new-edit",
      "revision-a",
    );
    expect(() => confirmWritingRestore(laterState, preview)).toThrow(
      "changed after this preview",
    );
    expect(current.drafts[0].revisions).toHaveLength(2);
  });

  it("does not hide a new concurrent branch behind an earlier resolution choice", () => {
    const conflict = save(save(), "Another branch", "branch-b");
    const newest = save(conflict, "A third branch", "branch-c");
    expect(() =>
      saveWritingRevision(newest, {
        draftId: "draft-1",
        baseId: "revision-a",
        revisionId: "resolve",
        text: "Original text",
        now: later,
        resolve: true,
        expectedTips: conflict.drafts[0].tips,
      }),
    ).toThrow("Another version arrived");
    expect(newest.drafts[0].tips).toHaveLength(3);
  });
});
