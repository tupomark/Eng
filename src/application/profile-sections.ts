import { emptyState, type LearningState } from "@/domain";
import { parseLearningState } from "@/domain/validation";
import { previewLearningRestore } from "@/domain/restore";
import {
  emptyTaskLearningState,
  parseTaskLearningState,
  type TaskLearningState,
} from "@/domain/tasks/state";
import { TaskSession } from "./task-session";
import {
  applyAssessmentWithdrawals,
  ASSESSMENT_WITHDRAWAL_POLICIES,
} from "./assessment-withdrawals";
import { parseMaterialsState, mergeMaterials } from "@/domain/materials/state";
import {
  emptyMaterialsState,
  type MaterialsState,
} from "@/domain/materials/types";
import {
  emptyUserLexicalCatalog,
  parseUserLexicalCatalog,
  mergeUserLexicalCatalog,
  type UserLexicalCatalog,
} from "@/domain/lexical-catalog";
import {
  emptySenseContexts,
  parseSenseContexts,
  mergeSenseContexts,
  senseContextIdentity,
  type SenseContextState,
} from "@/domain/sense-contexts";
import {
  emptyGoalState,
  parseGoalState,
  previewGoalRestore,
  type GoalState,
} from "@/domain/knowledge/goals";
import {
  parsePreferences,
  type Preferences,
} from "@/domain/preferences/preferences";
import {
  parseReaderPreferences,
  type ReaderPreferences,
} from "@/domain/reader-preferences";
import {
  parsePracticeSession,
  type PracticeSession,
} from "@/domain/tasks/practice-session";
import {
  parseTutorWorkspace,
  type TutorWorkspaceState,
} from "@/domain/ai/conversation";
import {
  PROFILE_JSON_SECTIONS,
  type ProfileJsonSectionId,
} from "@/domain/profile-backup";

/** Explicit local allowlist; never enumerate account-prefixed Tutor or SDK/Auth stores. */
export type ProfileLocalSectionId = Exclude<
  ProfileJsonSectionId,
  "writing" | "media-metadata"
>;
export const PROFILE_LOCAL_SECTIONS: readonly ProfileLocalSectionId[] =
  Object.freeze(
    PROFILE_JSON_SECTIONS.filter(
      (id): id is ProfileLocalSectionId =>
        id !== "writing" && id !== "media-metadata",
    ),
  );
export const PROFILE_SECTION_KEYS: Readonly<
  Record<ProfileLocalSectionId, string>
> = Object.freeze({
  learning: "lexis.learning.v1",
  tasks: "lexis.tasks.v1",
  materials: "lexis.materials.v1",
  catalog: "lexis.lexical-catalog.v1",
  "sense-contexts": "lexis.sense-contexts.v1",
  goals: "lexis.goals.v1",
  preferences: "lexis.preferences.v1",
  "reader-preferences": "lexis.reader.preferences.v1",
  "practice-session": "lexis.practice-session.v1",
  "tutor-local": "lexis.tutor.v1:local",
});
export const PROFILE_SECTION_MAX_CHARS: Readonly<
  Record<ProfileLocalSectionId, number>
> = Object.freeze({
  learning: 64_000_000,
  tasks: 10_000_000,
  materials: 20_000_000,
  catalog: 4_000_000,
  "sense-contexts": 2_000_000,
  goals: 100_000,
  preferences: 20_000,
  "reader-preferences": 1_000,
  "practice-session": 250_000,
  "tutor-local": 3_000_000,
});

export interface ProfileSectionReferences {
  savedSenseIds?: string[];
  targetSenseIds?: string[];
  catalogSenseIds?: string[];
  attemptIds?: string[];
  practiceAttemptIds?: string[];
  documentIds?: string[];
  sourceDocumentIds?: string[];
  contextSourceIds?: string[];
}
export interface ProfileSectionInspection {
  id: ProfileLocalSectionId;
  status: "absent" | "valid" | "opaque";
  counts: Record<string, number>;
  references: ProfileSectionReferences;
  /** No user text, provider payload or raw parse error is copied into diagnostics. */
  error?: string;
}
export interface ProfileSectionRestorePreview {
  id: ProfileLocalSectionId;
  expectedRaw: string | null;
  nextRaw: string | null;
  changed: boolean;
  counts: Record<string, number>;
  warnings: string[];
}
export interface ProfileSectionRestoreOptions {
  settings?: "keep-current" | "incoming";
}

type SectionValues = {
  learning: LearningState;
  tasks: TaskLearningState;
  materials: MaterialsState;
  catalog: UserLexicalCatalog;
  "sense-contexts": SenseContextState;
  goals: GoalState;
  preferences: Preferences;
  "reader-preferences": ReaderPreferences;
  "practice-session": PracticeSession;
  "tutor-local": TutorWorkspaceState;
};
function section(id: ProfileLocalSectionId) {
  if (!PROFILE_LOCAL_SECTIONS.includes(id))
    throw new Error("This profile section is not supported.");
}
function parseSection<K extends ProfileLocalSectionId>(
  id: K,
  raw: string,
): SectionValues[K] {
  section(id);
  if (raw.length > PROFILE_SECTION_MAX_CHARS[id])
    throw new Error(
      "This section exceeds its supported size. Keep the original bytes for recovery.",
    );
  const value: unknown = JSON.parse(raw);
  const parsers = {
    learning: parseLearningState,
    tasks: parseTaskLearningState,
    materials: parseMaterialsState,
    catalog: parseUserLexicalCatalog,
    "sense-contexts": parseSenseContexts,
    goals: parseGoalState,
    preferences: parsePreferences,
    "reader-preferences": parseReaderPreferences,
    "practice-session": parsePracticeSession,
    "tutor-local": (input: unknown) => parseTutorWorkspace(input, "local"),
  };
  const parsed = parsers[id](value) as SectionValues[K];
  // Existing component parsers deliberately tolerate legacy extra fields. A
  // portable recovery file must not label those bytes restorable and then
  // silently omit them during reconstruction. Keep them as opaque attachments.
  assertNoOmittedProperties(value, parsed);
  if (id === "materials")
    assertKnownMaterialsProperties(parsed as MaterialsState);
  return parsed;
}
function assertNoOmittedProperties(original: unknown, parsed: unknown): void {
  if (Array.isArray(original)) {
    if (!Array.isArray(parsed) || original.length !== parsed.length)
      throw new Error("This section contains unsupported collection data.");
    original.forEach((item, index) =>
      assertNoOmittedProperties(item, parsed[index]),
    );
    return;
  }
  if (!original || typeof original !== "object") return;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("This section contains unsupported data.");
  const output = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(original)) {
    if (!Object.hasOwn(output, key))
      throw new Error("This section contains unsupported fields.");
    assertNoOmittedProperties(value, output[key]);
  }
}
function knownProperties(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error("This material contains unsupported fields.");
}
/** The legacy materials parser preserves object fields instead of reconstructing them. */
function assertKnownMaterialsProperties(value: MaterialsState): void {
  knownProperties(value, [
    "version",
    "owner",
    "revision",
    "documents",
    "batches",
  ]);
  const anchor = (value: object) =>
    knownProperties(value, [
      "documentVersion",
      "chapterId",
      "paragraphIndex",
      "characterOffset",
    ]);
  for (const document of value.documents) {
    knownProperties(document, [
      "id",
      "version",
      "title",
      "sourceName",
      "format",
      "createdAt",
      "updatedAt",
      "rights",
      "archivedAt",
      "chapters",
      "position",
      "bookmarks",
    ]);
    anchor(document.position);
    for (const chapter of document.chapters)
      knownProperties(chapter, ["id", "title", "paragraphs"]);
    for (const bookmark of document.bookmarks) {
      knownProperties(bookmark, ["id", "excerpt", "createdAt", "anchor"]);
      anchor(bookmark.anchor);
    }
  }
  for (const batch of value.batches) {
    knownProperties(batch, [
      "id",
      "sourceName",
      "format",
      "createdAt",
      "rolledBackAt",
      "rows",
    ]);
    for (const row of batch.rows)
      knownProperties(row, [
        "id",
        "rowNumber",
        "original",
        "term",
        "translation",
        "context",
        "source",
        "partOfSpeech",
        "disposition",
        "senseId",
        "duplicateOf",
        "error",
      ]);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
const same = (left: unknown, right: unknown) =>
  canonical(left) === canonical(right);
const unique = (values: string[]) => [...new Set(values)];

/** Inspection never changes raw bytes; an invalid component stays an opaque recovery attachment. */
export function inspectProfileSection(
  id: ProfileLocalSectionId,
  raw: string | null,
): ProfileSectionInspection {
  section(id);
  if (raw === null) return { id, status: "absent", counts: {}, references: {} };
  try {
    let counts: Record<string, number> = {},
      references: ProfileSectionReferences = {};
    switch (id) {
      case "learning": {
        const value = parseSection(id, raw);
        counts = {
          meanings: value.saved.length,
          observations: value.evidence.length,
        };
        references = {
          savedSenseIds: value.saved.map((item) => item.senseId),
          targetSenseIds: unique(value.evidence.map((item) => item.senseId)),
        };
        break;
      }
      case "tasks": {
        const value = parseSection(id, raw);
        counts = {
          tasks: value.tasks.length,
          attempts: value.attempts.length,
          challenges: value.challenges.length,
          reviewItems: value.reviewItems.length,
          reviews: value.scheduleEvents.length,
        };
        references = {
          attemptIds: value.attempts.map((item) => item.id),
          targetSenseIds: unique(
            [...value.tasks, ...value.reviewItems].flatMap((item) =>
              item.target.kind === "sense" ? [item.target.senseId] : [],
            ),
          ),
        };
        break;
      }
      case "materials": {
        const value = parseSection(id, raw);
        counts = {
          documents: value.documents.length,
          chapters: value.documents.reduce(
            (sum, item) => sum + item.chapters.length,
            0,
          ),
          bookmarks: value.documents.reduce(
            (sum, item) => sum + item.bookmarks.length,
            0,
          ),
          batches: value.batches.length,
          rows: value.batches.reduce((sum, item) => sum + item.rows.length, 0),
        };
        references = {
          documentIds: value.documents.map((item) => item.id),
          targetSenseIds: unique(
            value.batches.flatMap((batch) =>
              batch.rows.flatMap((row) => (row.senseId ? [row.senseId] : [])),
            ),
          ),
        };
        break;
      }
      case "catalog": {
        const value = parseSection(id, raw);
        counts = {
          lexemes: value.entries.length,
          meanings: value.entries.reduce(
            (sum, item) => sum + item.senses.length,
            0,
          ),
        };
        references = {
          catalogSenseIds: value.entries.flatMap((item) =>
            item.senses.map((sense) => sense.id),
          ),
        };
        break;
      }
      case "sense-contexts": {
        const value = parseSection(id, raw);
        counts = { passages: value.contexts.length };
        references = {
          targetSenseIds: unique(value.contexts.map((item) => item.senseId)),
          sourceDocumentIds: unique(
            value.contexts.flatMap((item) =>
              item.source?.documentId ? [item.source.documentId] : [],
            ),
          ),
        };
        break;
      }
      case "goals":
        counts = { goals: parseSection(id, raw).goals.length };
        break;
      case "preferences":
        parseSection(id, raw);
        counts = { settings: 1 };
        break;
      case "reader-preferences":
        parseSection(id, raw);
        counts = { settings: 1 };
        break;
      case "practice-session": {
        const value = parseSection(id, raw);
        counts = { sessions: 1, attempts: value.attemptIds.length };
        references = {
          practiceAttemptIds: value.attemptIds,
          targetSenseIds: [value.senseId],
        };
        break;
      }
      case "tutor-local": {
        const value = parseSection(id, raw);
        counts = {
          conversations: value.sessions.length,
          messages: value.sessions.reduce(
            (sum, item) => sum + item.messages.length,
            0,
          ),
          pendingRequests: value.sessions.filter((item) => item.pendingRequest)
            .length,
        };
        references = {
          contextSourceIds: unique(
            value.sessions.flatMap((item) =>
              item.messages.flatMap((message) => message.sourceIds),
            ),
          ),
        };
        break;
      }
    }
    return { id, status: "valid", counts, references };
  } catch {
    return {
      id,
      status: "opaque",
      counts: {},
      references: {},
      error:
        "This section cannot be restored safely. Its exact original bytes can still be exported for recovery.",
    };
  }
}

/** Neither incoming pending sends nor their former permissions survive restoration. */
function safeTutor(value: TutorWorkspaceState): TutorWorkspaceState {
  return {
    ...value,
    sessions: value.sessions.map((session) => {
      const restored = {
        ...session,
        messages: session.messages.map((message) =>
          message.status === "pending"
            ? { ...message, status: "cancelled" as const }
            : message,
        ),
      };
      delete restored.pendingRequest;
      return restored;
    }),
  };
}
function mergeTutor(
  current: TutorWorkspaceState | null,
  incoming: TutorWorkspaceState,
): TutorWorkspaceState {
  const restored = safeTutor(incoming);
  if (!current) return restored;
  const base = safeTutor(current);
  const sessions = new Map(base.sessions.map((item) => [item.id, item]));
  for (const item of restored.sessions) {
    const previous = sessions.get(item.id);
    if (previous && !same(previous, item))
      throw new Error(
        "A Tutor conversation has conflicting revisions. Both copies are preserved; resolve the conflict before restoring this section.",
      );
    if (!previous) sessions.set(item.id, item);
  }
  return parseTutorWorkspace(
    { ...base, sessions: [...sessions.values()] },
    "local",
  );
}

/** Produces a pure, byte-guarded plan. Only the coordinator can apply its writes. */
export function previewProfileSectionRestore(
  id: ProfileLocalSectionId,
  currentRaw: string | null,
  incomingRaw: string | null,
  options: ProfileSectionRestoreOptions = {},
): ProfileSectionRestorePreview {
  section(id);
  if (incomingRaw === null)
    return {
      id,
      expectedRaw: currentRaw,
      nextRaw: currentRaw,
      changed: false,
      counts: inspectProfileSection(id, currentRaw).counts,
      warnings: [],
    };
  // Parse first even on identical bytes: corruption is never laundered into a valid no-op.
  parseSection(id, incomingRaw);
  if (currentRaw !== null) parseSection(id, currentRaw);
  const warnings: string[] = [];
  let candidate: unknown;
  switch (id) {
    case "learning": {
      const result = previewLearningRestore(
        currentRaw === null ? emptyState() : parseSection(id, currentRaw),
        parseSection(id, incomingRaw),
      );
      if (!result.merged)
        throw new Error(
          "Learning identities or saved contexts conflict. Existing history has not been overwritten.",
        );
      candidate = result.merged;
      break;
    }
    case "tasks": {
      const repository = {
        read: () => ({
          state:
            currentRaw === null
              ? emptyTaskLearningState()
              : parseSection(id, currentRaw),
          serialized: currentRaw,
        }),
        commit: () => {
          throw new Error("A profile preview must not write data.");
        },
      };
      const session = new TaskSession(repository, {
        now: () => "2000-01-01T00:00:00.000Z",
        createId: () => {
          throw new Error(
            "A profile restore must preserve original identities.",
          );
        },
      });
      session.load();
      candidate = applyAssessmentWithdrawals(
        session.previewRestore(incomingRaw).candidate,
        ASSESSMENT_WITHDRAWAL_POLICIES,
      );
      break;
    }
    case "materials": {
      const base =
          currentRaw === null
            ? emptyMaterialsState()
            : parseSection(id, currentRaw),
        incoming = parseSection(id, incomingRaw);
      const documents = new Map(base.documents.map((item) => [item.id, item]));
      for (const item of incoming.documents) {
        const existing = documents.get(item.id);
        if (existing && !same(existing, item))
          throw new Error(
            "A document has conflicting content, bookmarks or reading position. Keep both copies before resolving this restore.",
          );
      }
      const batches = new Map(base.batches.map((item) => [item.id, item]));
      for (const item of incoming.batches) {
        const existing = batches.get(item.id);
        if (existing && !same(existing, item))
          throw new Error(
            "An import batch has conflicting original rows or decisions. Both copies are preserved; resolve the conflict before restoring this section.",
          );
      }
      // This profile boundary compares object meaning, not incidental JSON key
      // order. Pass only genuinely new objects to the legacy additive helpers.
      candidate = mergeMaterials(base, {
        ...incoming,
        documents: incoming.documents.filter((item) => !documents.has(item.id)),
        batches: incoming.batches.filter((item) => !batches.has(item.id)),
      });
      break;
    }
    case "catalog":
      candidate = mergeUserLexicalCatalog(
        currentRaw === null
          ? emptyUserLexicalCatalog()
          : parseSection(id, currentRaw),
        parseSection(id, incomingRaw),
      );
      break;
    case "sense-contexts": {
      const base =
          currentRaw === null
            ? emptySenseContexts()
            : parseSection(id, currentRaw),
        incoming = parseSection(id, incomingRaw);
      const identities = new Map(
        base.contexts.map((item) => [senseContextIdentity(item), item.id]),
      );
      const byId = new Map(base.contexts.map((item) => [item.id, item]));
      for (const item of incoming.contexts) {
        const sameId = byId.get(item.id);
        if (sameId && !same(sameId, item))
          throw new Error(
            "A saved passage ID has conflicting original metadata. Both copies are preserved; resolve the conflict before restoring this section.",
          );
        const existingId = identities.get(senseContextIdentity(item));
        if (existingId && existingId !== item.id)
          throw new Error(
            "A saved passage has the same content under a different identity. Resolve this conflict rather than silently discarding an ID.",
          );
      }
      candidate = mergeSenseContexts(base, incoming);
      break;
    }
    case "goals":
      candidate = previewGoalRestore(
        currentRaw === null ? emptyGoalState() : parseSection(id, currentRaw),
        parseSection(id, incomingRaw),
      ).state;
      break;
    case "preferences":
    case "reader-preferences": {
      if (options.settings !== "incoming") {
        if (currentRaw !== incomingRaw)
          warnings.push(
            "Kept this device's settings. Restoring saved settings requires an explicit choice.",
          );
        return {
          id,
          expectedRaw: currentRaw,
          nextRaw: currentRaw,
          changed: false,
          counts: inspectProfileSection(id, currentRaw).counts,
          warnings,
        };
      }
      candidate = parseSection(id, incomingRaw);
      break;
    }
    case "practice-session": {
      if (
        currentRaw !== null &&
        !same(parseSection(id, currentRaw), parseSection(id, incomingRaw))
      ) {
        warnings.push(
          "Kept this device's active practice position. Imported task attempts remain in the learning history.",
        );
        return {
          id,
          expectedRaw: currentRaw,
          nextRaw: currentRaw,
          changed: false,
          counts: inspectProfileSection(id, currentRaw).counts,
          warnings,
        };
      }
      candidate = parseSection(id, incomingRaw);
      break;
    }
    case "tutor-local": {
      const incoming = parseSection(id, incomingRaw),
        current = currentRaw === null ? null : parseSection(id, currentRaw);
      candidate = mergeTutor(current, incoming);
      if (
        [...(current?.sessions ?? []), ...incoming.sessions].some(
          (item) =>
            item.pendingRequest ||
            item.messages.some((message) => message.status === "pending"),
        )
      )
        warnings.push(
          "Restored pending Tutor messages are cancelled. Context permissions and pending requests are not renewed or sent.",
        );
      break;
    }
  }
  const normalized = parseSection(id, JSON.stringify(candidate));
  const nextRaw =
    currentRaw !== null && same(parseSection(id, currentRaw), normalized)
      ? currentRaw
      : JSON.stringify(normalized);
  return {
    id,
    expectedRaw: currentRaw,
    nextRaw,
    changed: nextRaw !== currentRaw,
    counts: inspectProfileSection(id, nextRaw).counts,
    warnings,
  };
}
