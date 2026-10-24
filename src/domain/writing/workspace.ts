export const WRITING_LIMITS = {
  drafts: 100,
  revisions: 500,
  text: 100_000,
} as const;
export type WritingKind = "free" | "email" | "essay" | "goal";
export interface WritingRevision {
  id: string;
  parentId: string | null;
  text: string;
  createdAt: string;
  origin: "independent" | "restored" | "merged";
}
export interface WritingView {
  start: number;
  end: number;
  scrollTop: number;
}
export interface WritingDraft {
  id: string;
  title: string;
  kind: WritingKind;
  createdAt: string;
  updatedAt: string;
  headId: string;
  /** More than one tip means a conflict. Neither version is discarded. */
  tips: string[];
  revisions: WritingRevision[];
  view: WritingView;
  archivedAt?: string;
}
export interface WritingWorkspace {
  version: 1;
  owner: string;
  drafts: WritingDraft[];
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function identifier(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new Error("A valid writing identifier is required.");
}
function date(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error("A valid writing timestamp is required.");
}
function text(
  value: unknown,
  maximum: number = WRITING_LIMITS.text,
): asserts value is string {
  if (typeof value !== "string" || value.length > maximum)
    throw new Error(`Writing text must contain at most ${maximum} characters.`);
}

export function emptyWritingWorkspace(owner = "local"): WritingWorkspace {
  identifier(owner);
  return { version: 1, owner, drafts: [] };
}

/** Unknown or damaged data is rejected, never replaced by an empty workspace. */
export function assertWritingWorkspace(
  value: unknown,
  owner?: string,
): asserts value is WritingWorkspace {
  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.drafts) ||
    value.drafts.length > WRITING_LIMITS.drafts
  )
    throw new Error("This writing workspace could not be opened safely.");
  identifier(value.owner);
  if (owner && value.owner !== owner)
    throw new Error("This writing workspace belongs to another profile.");
  const draftIds = new Set<string>();
  for (const draft of value.drafts) {
    if (!object(draft)) throw new Error("A draft is damaged.");
    identifier(draft.id);
    if (draftIds.has(draft.id)) throw new Error("Duplicate writing draft ID.");
    draftIds.add(draft.id);
    text(draft.title, 160);
    if (!["free", "email", "essay", "goal"].includes(String(draft.kind)))
      throw new Error("Unknown writing format.");
    date(draft.createdAt);
    date(draft.updatedAt);
    if (draft.archivedAt !== undefined) date(draft.archivedAt);
    if (
      !Array.isArray(draft.revisions) ||
      !draft.revisions.length ||
      draft.revisions.length > WRITING_LIMITS.revisions
    )
      throw new Error(
        "Writing revisions are missing or exceed the safe limit.",
      );
    const revisionIds = new Set<string>();
    for (const revision of draft.revisions) {
      if (!object(revision)) throw new Error("A writing revision is damaged.");
      identifier(revision.id);
      text(revision.text);
      date(revision.createdAt);
      if (
        revisionIds.has(revision.id) ||
        (revision.parentId !== null &&
          !revisionIds.has(String(revision.parentId)))
      )
        throw new Error("Writing revision history is inconsistent.");
      if (
        !["independent", "restored", "merged"].includes(String(revision.origin))
      )
        throw new Error("Unknown writing revision source.");
      revisionIds.add(revision.id);
    }
    identifier(draft.headId);
    if (
      !revisionIds.has(draft.headId) ||
      !Array.isArray(draft.tips) ||
      !draft.tips.length ||
      new Set(draft.tips).size !== draft.tips.length ||
      !draft.tips.includes(draft.headId) ||
      draft.tips.some((tip) => typeof tip !== "string" || !revisionIds.has(tip))
    )
      throw new Error("The current writing revision is missing.");
    if (
      !object(draft.view) ||
      !Number.isInteger(draft.view.start) ||
      !Number.isInteger(draft.view.end) ||
      Number(draft.view.start) < 0 ||
      Number(draft.view.end) < Number(draft.view.start) ||
      typeof draft.view.scrollTop !== "number" ||
      !Number.isFinite(draft.view.scrollTop) ||
      draft.view.scrollTop < 0
    )
      throw new Error("The writing cursor position is damaged.");
    const head = draft.revisions.find(
      (revision) => object(revision) && revision.id === draft.headId,
    );
    if (!object(head) || Number(draft.view.end) > String(head.text).length)
      throw new Error("Writing cursor exceeds the current revision.");
  }
}

export function currentWritingRevision(draft: WritingDraft): WritingRevision {
  const revision = draft.revisions.find((item) => item.id === draft.headId);
  if (!revision)
    throw new Error("The current writing revision is unavailable.");
  return revision;
}

export function createWritingDraft(
  state: WritingWorkspace,
  input: {
    id: string;
    revisionId: string;
    title: string;
    kind: WritingKind;
    now: string;
  },
): WritingWorkspace {
  assertWritingWorkspace(state);
  identifier(input.id);
  identifier(input.revisionId);
  text(input.title, 160);
  date(input.now);
  if (state.drafts.some((draft) => draft.id === input.id)) return state;
  if (state.drafts.length >= WRITING_LIMITS.drafts)
    throw new Error(
      "This local workspace has reached its draft limit. Export your writing; existing drafts remain available.",
    );
  const draft: WritingDraft = {
    id: input.id,
    title: input.title.trim() || "Untitled writing",
    kind: input.kind,
    createdAt: input.now,
    updatedAt: input.now,
    headId: input.revisionId,
    tips: [input.revisionId],
    revisions: [
      {
        id: input.revisionId,
        parentId: null,
        text: "",
        createdAt: input.now,
        origin: "independent",
      },
    ],
    view: { start: 0, end: 0, scrollTop: 0 },
  };
  const next = { ...state, drafts: [...state.drafts, draft] };
  assertWritingWorkspace(next);
  return next;
}

export function saveWritingRevision(
  state: WritingWorkspace,
  input: {
    draftId: string;
    baseId: string;
    revisionId: string;
    text: string;
    now: string;
    origin?: WritingRevision["origin"];
    resolve?: boolean;
    expectedTips?: readonly string[];
  },
): WritingWorkspace {
  assertWritingWorkspace(state);
  identifier(input.revisionId);
  text(input.text);
  date(input.now);
  const draft = state.drafts.find((item) => item.id === input.draftId);
  if (!draft || draft.archivedAt)
    throw new Error("Open an active draft before saving.");
  const previous = draft.revisions.find(
    (revision) => revision.id === input.revisionId,
  );
  if (previous) {
    if (previous.text !== input.text || previous.parentId !== input.baseId)
      throw new Error("This revision ID was used for different writing.");
    return state;
  }
  const base = draft.revisions.find((revision) => revision.id === input.baseId);
  if (!base)
    throw new Error(
      "The original revision could not be found. Your text has not been replaced.",
    );
  if (
    input.resolve &&
    (!input.expectedTips ||
      [...input.expectedTips].sort().join("\n") !==
        [...draft.tips].sort().join("\n"))
  )
    throw new Error(
      "Another version arrived while resolving this draft. Review all versions before choosing again.",
    );
  if (Date.parse(input.now) < Date.parse(base.createdAt))
    throw new Error("Check the device clock before saving this revision.");
  if (
    draft.tips.length === 1 &&
    draft.headId === input.baseId &&
    base.text === input.text
  )
    return state;
  if (draft.revisions.length >= WRITING_LIMITS.revisions)
    throw new Error(
      "Version limit reached. Export this draft before continuing in a new draft.",
    );
  const conflict =
    !input.resolve && (draft.tips.length > 1 || draft.headId !== input.baseId);
  const tips = input.resolve
    ? [input.revisionId]
    : [...draft.tips.filter((tip) => tip !== input.baseId), input.revisionId];
  const revision: WritingRevision = {
    id: input.revisionId,
    parentId: input.baseId,
    text: input.text,
    createdAt: input.now,
    origin: input.resolve ? "merged" : (input.origin ?? "independent"),
  };
  const nextDraft: WritingDraft = {
    ...draft,
    updatedAt: input.now,
    revisions: [...draft.revisions, revision],
    tips,
    headId: conflict ? draft.headId : input.revisionId,
    view: conflict
      ? draft.view
      : {
          start: Math.min(draft.view.start, input.text.length),
          end: Math.min(draft.view.end, input.text.length),
          scrollTop: draft.view.scrollTop,
        },
  };
  const next = {
    ...state,
    drafts: state.drafts.map((item) =>
      item.id === draft.id ? nextDraft : item,
    ),
  };
  assertWritingWorkspace(next);
  return next;
}

export function saveWritingView(
  state: WritingWorkspace,
  draftId: string,
  revisionId: string,
  view: WritingView,
): WritingWorkspace {
  const draft = state.drafts.find((item) => item.id === draftId);
  if (!draft || draft.headId !== revisionId) return state;
  const next = {
    ...state,
    drafts: state.drafts.map((item) =>
      item.id === draftId ? { ...item, view } : item,
    ),
  };
  assertWritingWorkspace(next);
  return next;
}

export function archiveWritingDraft(
  state: WritingWorkspace,
  draftId: string,
  now: string,
  archived = true,
): WritingWorkspace {
  date(now);
  const next = {
    ...state,
    drafts: state.drafts.map((draft) =>
      draft.id === draftId
        ? { ...draft, archivedAt: archived ? now : undefined }
        : draft,
    ),
  };
  assertWritingWorkspace(next);
  return next;
}

/** A bounded local excerpt references its exact revision; it is never an AI permission. */
export interface WritingContext {
  version: 1;
  draftId: string;
  revisionId: string;
  excerpt: string;
  createdAt: string;
}
export function writingContext(
  draft: WritingDraft,
  start: number,
  end: number,
  now: string,
): WritingContext {
  const revision = currentWritingRevision(draft);
  date(now);
  if (!Number.isInteger(start) || !Number.isInteger(end))
    throw new Error("Choose a valid writing text range.");
  let from = Math.max(0, Math.min(revision.text.length, start));
  if (
    from > 0 &&
    /[\uDC00-\uDFFF]/.test(revision.text[from] ?? "") &&
    /[\uD800-\uDBFF]/.test(revision.text[from - 1])
  )
    from -= 1;
  let to = Math.max(from, Math.min(revision.text.length, end, from + 1_000));
  if (
    to > from &&
    /[\uD800-\uDBFF]/.test(revision.text[to - 1]) &&
    /[\uDC00-\uDFFF]/.test(revision.text[to] ?? "")
  )
    to -= 1;
  return {
    version: 1,
    draftId: draft.id,
    revisionId: revision.id,
    excerpt: revision.text.slice(from, to),
    createdAt: now,
  };
}
