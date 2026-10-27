import { describe, expect, it } from "vitest";
import {
  inspectProfileSection,
  previewProfileSectionRestore,
  PROFILE_LOCAL_SECTIONS,
  PROFILE_SECTION_KEYS,
} from "@/application/profile-sections";
import { emptyState, saveSense, reviewSense, disputeEvidence } from "@/domain";
import {
  emptyTaskLearningState,
  parseTaskLearningState,
  taskObservations,
} from "@/domain/tasks/state";
import { TaskSession } from "@/application/task-session";
import {
  createUserLexicalEntry,
  addUserLexicalEntry,
  emptyUserLexicalCatalog,
} from "@/domain/lexical-catalog";
import {
  emptyMaterialsState,
  type MaterialsState,
} from "@/domain/materials/types";
import { parseMaterialsState } from "@/domain/materials/state";
import { DEFAULT_PREFERENCES } from "@/domain/preferences/preferences";
import {
  DEFAULT_READER_PREFERENCES,
  parseReaderPreferences,
} from "@/domain/reader-preferences";
import {
  emptyTutorWorkspace,
  type TutorWorkspaceState,
} from "@/domain/ai/conversation";
import type { TaskDefinition } from "@/domain/tasks";
import { emptySenseContexts } from "@/domain/sense-contexts";
import { emptyGoalState } from "@/domain/knowledge/goals";
import { PROFILE_JSON_SECTIONS } from "@/domain/profile-backup";

const now = "2026-10-26T08:00:00.000Z";
const later = "2026-10-26T09:00:00.000Z";
const raw = JSON.stringify;
const task: TaskDefinition = {
  id: "original-recall",
  version: "1",
  target: { kind: "sense", senseId: "external-sense" },
  skill: "recall",
  format: "recall",
  promptFamily: "word-recall",
  prompt: "A sheltered place where boats stop.",
  acceptedAnswers: ["harbour", "harbor"],
  explanation: "Both regional forms are accepted by this fixture.",
  rubricVersion: "original-key-1",
  evaluator: "deterministic",
  hints: [],
  source: {
    provider: "LEXIS test author",
    version: "1",
    rights: "Original test fixture",
    kind: "editorial",
  },
};
function taskState() {
  let state = emptyTaskLearningState(),
    serialized: string | null = null,
    id = 0;
  const session = new TaskSession(
    {
      read: () => ({ state, serialized }),
      commit: (next, expected) => {
        expect(expected).toBe(serialized);
        state = next;
        serialized = raw(next);
        return serialized;
      },
    },
    { now: () => now, createId: () => `attempt-${++id}` },
  );
  session.load();
  const attempt = session.startTask(task);
  session.submitTask(attempt.id, "harbor");
  return state;
}
function documentState(): MaterialsState {
  return parseMaterialsState({
    ...emptyMaterialsState(),
    revision: 1,
    documents: [
      {
        id: "original-document",
        version: "original-version",
        title: "Original coast",
        sourceName: "original.txt",
        format: "txt",
        createdAt: now,
        updatedAt: now,
        rights: "user-provided",
        chapters: [
          {
            id: "chapter-one",
            title: "Coast",
            paragraphs: ["The boat reached the harbour."],
          },
        ],
        position: {
          documentVersion: "original-version",
          chapterId: "chapter-one",
          paragraphIndex: 0,
          characterOffset: 0,
        },
        bookmarks: [],
      },
    ],
  });
}
function pendingTutor(): TutorWorkspaceState {
  const value = emptyTutorWorkspace("local", "conversation-one");
  value.sessions[0].draft = "Please explain this phrase.";
  value.sessions[0].messages = [
    {
      id: "message-one",
      requestId: "request-one",
      role: "user",
      text: "Please explain this phrase.",
      occurredAt: now,
      status: "pending",
      sourceIds: ["source-one"],
    },
  ];
  value.sessions[0].pendingRequest = {
    requestId: "request-one",
    sessionId: "conversation-one",
    style: "mentor",
    sessionType: "guided-lesson",
    message: "Please explain this phrase.",
    history: [],
    context: {
      id: "context-one",
      excerpt: "A private excerpt consented to for an earlier request.",
      sourceIds: ["source-one"],
    },
    consent: true,
  };
  return value;
}

describe("whole-profile section contracts", () => {
  it("uses an explicit local allowlist, with no account or SDK credential enumeration", () => {
    expect(PROFILE_LOCAL_SECTIONS).toHaveLength(10);
    expect(PROFILE_LOCAL_SECTIONS).toEqual(
      PROFILE_JSON_SECTIONS.filter(
        (id) => id !== "writing" && id !== "media-metadata",
      ),
    );
    expect(Object.values(PROFILE_SECTION_KEYS)).toHaveLength(10);
    expect(PROFILE_SECTION_KEYS["tutor-local"]).toBe("lexis.tutor.v1:local");
    expect(
      Object.values(PROFILE_SECTION_KEYS).some((key) =>
        /account:|supabase|token|auth/u.test(key),
      ),
    ).toBe(false);
    expect(() => inspectProfileSection("auth" as never, "{}")).toThrow(
      "not supported",
    );
  });

  it("classifies unsupported top-level fields in every local section as opaque without discarding them", () => {
    const examples = {
      learning: emptyState(),
      tasks: emptyTaskLearningState(),
      materials: emptyMaterialsState(),
      catalog: emptyUserLexicalCatalog(),
      "sense-contexts": emptySenseContexts(),
      goals: emptyGoalState(),
      preferences: DEFAULT_PREFERENCES,
      "reader-preferences": DEFAULT_READER_PREFERENCES,
      "practice-session": {
        version: 1,
        revision: 0,
        startedAt: now,
        attemptIds: [],
        senseId: "sense-one",
        format: "recall",
      },
      "tutor-local": emptyTutorWorkspace("local", "original-session"),
    };
    for (const id of PROFILE_LOCAL_SECTIONS) {
      expect(inspectProfileSection(id, raw(examples[id])).status).toBe("valid");
      const incoming = raw({
        ...examples[id],
        futureMetadata: { original: true },
      });
      expect(inspectProfileSection(id, incoming).status).toBe("opaque");
      expect(() => previewProfileSectionRestore(id, null, incoming)).toThrow();
      expect(incoming).toContain("futureMetadata");
    }
  });

  it("does not silently reconstruct unknown nested learning, task, Tutor or material properties", () => {
    const learning = saveSense(emptyState(), "sense-one", "Original", now);
    const taskData = taskState();
    const document = documentState();
    const tutor = pendingTutor();
    const cases = [
      [
        "learning",
        {
          ...learning,
          saved: learning.saved.map((item) => ({ ...item, unknown: true })),
        },
      ],
      [
        "tasks",
        {
          ...taskData,
          tasks: taskData.tasks.map((item) => ({
            ...item,
            source: { ...item.source, unknown: true },
          })),
        },
      ],
      [
        "tasks",
        {
          ...taskData,
          attempts: taskData.attempts.map((item) => ({
            ...item,
            assistance: { ...item.assistance, unknown: true },
          })),
        },
      ],
      [
        "materials",
        {
          ...document,
          documents: document.documents.map((item) => ({
            ...item,
            chapters: item.chapters.map((chapter) => ({
              ...chapter,
              unknown: true,
            })),
          })),
        },
      ],
      [
        "materials",
        {
          ...document,
          documents: document.documents.map((item) => ({
            ...item,
            position: { ...item.position, unknown: true },
          })),
        },
      ],
      [
        "tutor-local",
        {
          ...tutor,
          sessions: tutor.sessions.map((item) => ({
            ...item,
            messages: item.messages.map((message) => ({
              ...message,
              unknown: true,
            })),
          })),
        },
      ],
    ] as const;
    for (const [id, value] of cases) {
      const incoming = raw(value);
      expect(inspectProfileSection(id, incoming).status).toBe("opaque");
      expect(() => previewProfileSectionRestore(id, null, incoming)).toThrow();
    }
  });

  it("distinguishes absence from opaque damaged bytes and never substitutes defaults", () => {
    const original = "{damaged private catalogue";
    expect(inspectProfileSection("catalog", null)).toEqual({
      id: "catalog",
      status: "absent",
      counts: {},
      references: {},
    });
    const result = inspectProfileSection("catalog", original);
    expect(result.status).toBe("opaque");
    expect(result.counts).toEqual({});
    expect(result.error).not.toContain("private catalogue");
    expect(() =>
      previewProfileSectionRestore("catalog", null, original),
    ).toThrow();
    expect(() =>
      previewProfileSectionRestore(
        "catalog",
        original,
        raw(emptyUserLexicalCatalog()),
      ),
    ).toThrow();
    expect(original).toBe("{damaged private catalogue");
  });

  it("treats absent incoming data as no command, including an unreadable unselected destination", () => {
    const damaged = "{keep the exact bytes";
    expect(previewProfileSectionRestore("tasks", damaged, null)).toMatchObject({
      expectedRaw: damaged,
      nextRaw: damaged,
      changed: false,
    });
  });

  it("keeps exact original bytes for a semantic no-op, including whitespace and property order", () => {
    const bytes =
      '{\n "readerProgress": 0, "evidence": [], "saved": [], "version": 1\n}';
    const result = previewProfileSectionRestore(
      "learning",
      bytes,
      raw(emptyState()),
    );
    expect(result.nextRaw).toBe(bytes);
    expect(result.changed).toBe(false);
  });

  it("preserves arbitrary legacy IDs, unavailable meanings and exclusions without creating evidence", () => {
    let history = saveSense(
      emptyState(),
      "retired-external-meaning",
      "Original context",
      now,
    );
    history = reviewSense(
      history,
      "retired-external-meaning",
      "good",
      later,
      "legacy-id-not-a-uuid",
    );
    history = disputeEvidence(history, "legacy-id-not-a-uuid", later);
    const first = previewProfileSectionRestore("learning", null, raw(history));
    expect(JSON.parse(first.nextRaw!)).toEqual(history);
    expect(
      inspectProfileSection("learning", first.nextRaw).references.savedSenseIds,
    ).toEqual(["retired-external-meaning"]);
    const second = previewProfileSectionRestore(
      "learning",
      first.nextRaw,
      raw(history),
    );
    expect(second.changed).toBe(false);
    expect(JSON.parse(second.nextRaw!).evidence).toHaveLength(1);
    expect(JSON.parse(second.nextRaw!).evidence[0].disputedAt).toBe(later);
  });

  it("blocks learning collisions rather than reassigning one event or source context", () => {
    const current = saveSense(
      emptyState(),
      "sense-one",
      "Current deliberate source",
      now,
    );
    const incoming = saveSense(
      emptyState(),
      "sense-one",
      "Different original source",
      now,
    );
    expect(() =>
      previewProfileSectionRestore("learning", raw(current), raw(incoming)),
    ).toThrow("conflict");
    expect(current.saved[0].context).toBe("Current deliberate source");
  });

  it("restores common task history with valid alternatives and only the actually observed skill", () => {
    const state = taskState();
    const first = previewProfileSectionRestore("tasks", null, raw(state));
    const restored = parseTaskLearningState(JSON.parse(first.nextRaw!));
    expect(restored.attempts[0].answer).toBe("harbor");
    expect(taskObservations(restored)).toMatchObject([
      { skill: "recall", independent: true, outcome: "accepted" },
    ]);
    expect(
      inspectProfileSection("tasks", first.nextRaw).references.attemptIds,
    ).toEqual(state.attempts.map((item) => item.id));
    expect(
      previewProfileSectionRestore("tasks", first.nextRaw, raw(state)).changed,
    ).toBe(false);
  });

  it("blocks an inconsistent task attempt instead of exporting it as valid or repairing its target", () => {
    const damaged = structuredClone(taskState());
    damaged.attempts[0].taskId = "missing-task-definition";
    expect(inspectProfileSection("tasks", raw(damaged)).status).toBe("opaque");
    expect(() =>
      previewProfileSectionRestore("tasks", null, raw(damaged)),
    ).toThrow();
  });

  it("preserves private document contents and blocks a conflicting saved position or bookmark", () => {
    const state = documentState();
    const first = previewProfileSectionRestore("materials", null, raw(state));
    expect(JSON.parse(first.nextRaw!)).toEqual(state);
    expect(inspectProfileSection("materials", first.nextRaw)).toMatchObject({
      status: "valid",
      counts: { documents: 1, chapters: 1 },
      references: { documentIds: ["original-document"] },
    });
    const conflict = structuredClone(state);
    conflict.documents[0].position.characterOffset = 4;
    expect(() =>
      previewProfileSectionRestore("materials", first.nextRaw, raw(conflict)),
    ).toThrow("reading position");
    expect(
      previewProfileSectionRestore("materials", first.nextRaw, raw(state))
        .changed,
    ).toBe(false);
  });

  it("keeps namespaced authored identities and does not manufacture learning observations", () => {
    const entry = createUserLexicalEntry({
      lexemeId: "user-lexeme-one",
      senseId: "user-sense-one",
      lemma: "harbour",
      partOfSpeech: "noun",
      definition: "A sheltered place for boats.",
      at: now,
    });
    const state = addUserLexicalEntry(emptyUserLexicalCatalog(), entry);
    const restored = previewProfileSectionRestore("catalog", null, raw(state));
    expect(JSON.parse(restored.nextRaw!).entries[0].senses[0].id).toBe(
      "user-sense-one",
    );
    expect(
      inspectProfileSection("catalog", restored.nextRaw).references
        .catalogSenseIds,
    ).toEqual(["user-sense-one"]);
    expect(
      previewProfileSectionRestore("catalog", restored.nextRaw, raw(state))
        .changed,
    ).toBe(false);
    const conflict = structuredClone(state);
    conflict.entries[0].senses[0].definition =
      "An incompatible original meaning.";
    expect(() =>
      previewProfileSectionRestore("catalog", restored.nextRaw, raw(conflict)),
    ).toThrow("different original content");
  });

  it("does not silently discard a passage identity when equal-looking sources use different IDs", () => {
    const passage = {
      id: "passage-one",
      senseId: "sense-one",
      surface: "harbour",
      excerpt: "The boat waited in the harbour.",
      savedAt: now,
    };
    const current = { ...emptySenseContexts(), contexts: [passage] };
    const incoming = {
      ...emptySenseContexts(),
      contexts: [{ ...passage, id: "passage-two" }],
    };
    expect(() =>
      previewProfileSectionRestore(
        "sense-contexts",
        raw(current),
        raw(incoming),
      ),
    ).toThrow("different identity");
  });

  it("blocks changed original passage metadata under the same ID instead of silently keeping one copy", () => {
    const passage = {
      id: "passage-one",
      senseId: "sense-one",
      surface: "harbour",
      excerpt: "The boat waited in the harbour.",
      savedAt: now,
    };
    const current = raw({ ...emptySenseContexts(), contexts: [passage] });
    const incoming = raw({
      ...emptySenseContexts(),
      contexts: [{ ...passage, surface: "different original selection" }],
    });
    expect(() =>
      previewProfileSectionRestore("sense-contexts", current, incoming),
    ).toThrow("conflicting original metadata");
  });

  it("keeps local settings unless restoring them was explicitly selected", () => {
    const incoming = { ...DEFAULT_PREFERENCES, revision: 3, uiLanguage: "ru" };
    expect(
      previewProfileSectionRestore("preferences", null, raw(incoming)),
    ).toMatchObject({ nextRaw: null, changed: false });
    const current = raw(DEFAULT_PREFERENCES);
    expect(
      previewProfileSectionRestore("preferences", current, raw(incoming))
        .nextRaw,
    ).toBe(current);
    expect(
      JSON.parse(
        previewProfileSectionRestore("preferences", current, raw(incoming), {
          settings: "incoming",
        }).nextRaw!,
      ).uiLanguage,
    ).toBe("ru");
    expect(
      previewProfileSectionRestore(
        "reader-preferences",
        null,
        raw({ ...DEFAULT_READER_PREFERENCES, font: "serif" }),
      ),
    ).toMatchObject({ nextRaw: null, changed: false });
  });

  it("uses the same pure strict Reader validator as the actual settings component", () => {
    expect(parseReaderPreferences(DEFAULT_READER_PREFERENCES)).toEqual(
      DEFAULT_READER_PREFERENCES,
    );
    expect(() =>
      parseReaderPreferences({ ...DEFAULT_READER_PREFERENCES, fontSize: 0 }),
    ).toThrow();
    expect(() =>
      parseReaderPreferences({
        ...DEFAULT_READER_PREFERENCES,
        arbitrary: true,
      }),
    ).toThrow();
  });

  it("imports a missing practice position but preserves another active session and exposes attempt links", () => {
    const incoming = {
      version: 1,
      revision: 1,
      startedAt: now,
      attemptIds: ["attempt-one"],
      senseId: "external-sense",
      format: "recall",
    };
    const first = previewProfileSectionRestore(
      "practice-session",
      null,
      raw(incoming),
    );
    expect(
      inspectProfileSection("practice-session", first.nextRaw).references
        .practiceAttemptIds,
    ).toEqual(["attempt-one"]);
    const other = raw({
      ...incoming,
      attemptIds: ["attempt-two"],
      revision: 2,
    });
    const kept = previewProfileSectionRestore(
      "practice-session",
      other,
      raw(incoming),
    );
    expect(kept.nextRaw).toBe(other);
    expect(kept.warnings.join(" ")).toContain("active practice");
  });

  it("restores local Tutor drafts and history without renewing pending external requests or context consent", () => {
    const incoming = pendingTutor();
    const original = raw(incoming);
    const result = previewProfileSectionRestore("tutor-local", null, original);
    const restored = JSON.parse(result.nextRaw!) as TutorWorkspaceState;
    expect(restored.ownerScope).toBe("local");
    expect(restored.sessions[0].draft).toBe(incoming.sessions[0].draft);
    expect(restored.sessions[0].messages[0]).toMatchObject({
      id: "message-one",
      status: "cancelled",
      text: "Please explain this phrase.",
    });
    expect(restored.sessions[0].pendingRequest).toBeUndefined();
    expect(result.nextRaw).not.toContain("earlier request");
    expect(result.warnings.join(" ")).toContain("not renewed or sent");
    expect(raw(incoming)).toBe(original);
    expect(
      previewProfileSectionRestore("tutor-local", result.nextRaw, original)
        .changed,
    ).toBe(false);
  });

  it("rejects foreign Tutor ownership and conflicting local conversations without assigning random replacement IDs", () => {
    const local = pendingTutor();
    expect(
      inspectProfileSection(
        "tutor-local",
        raw({ ...local, ownerScope: "account:someone-else" }),
      ).status,
    ).toBe("opaque");
    const conflicting = structuredClone(local);
    conflicting.sessions[0].draft =
      "A different draft using the same conversation ID.";
    expect(() =>
      previewProfileSectionRestore("tutor-local", raw(local), raw(conflicting)),
    ).toThrow("conflicting revisions");
  });
});
