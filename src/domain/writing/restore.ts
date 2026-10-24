import {
  assertWritingWorkspace,
  type WritingDraft,
  type WritingWorkspace,
} from "./workspace";

export const MAX_WRITING_BACKUP_BYTES = 64 * 1_024 * 1_024;
export interface WritingRestorePreview {
  baseline: WritingWorkspace;
  candidate: WritingWorkspace;
  newDrafts: number;
  newRevisions: number;
  conflictDraftIds: string[];
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeDraft(
  current: WritingDraft,
  incoming: WritingDraft,
): WritingDraft {
  const known = new Map(
    current.revisions.map((revision) => [revision.id, revision]),
  );
  const revisions = [...current.revisions];
  for (const revision of incoming.revisions) {
    const previous = known.get(revision.id);
    if (previous && !same(previous, revision))
      throw new Error(
        "A writing revision has conflicting contents. No data has been restored; keep both backup files for review.",
      );
    if (!previous) {
      known.set(revision.id, revision);
      revisions.push(revision);
    }
  }
  // Unrelated documents sharing an ID must not be silently identified as one draft.
  if (current.revisions[0].id !== incoming.revisions[0].id)
    throw new Error(
      "Two unrelated drafts use the same identifier. No data has been restored.",
    );
  const parents = new Set(
    revisions.flatMap((revision) =>
      revision.parentId ? [revision.parentId] : [],
    ),
  );
  const tips = [...new Set([...current.tips, ...incoming.tips])].filter(
    (id) => !parents.has(id),
  );
  if (!tips.length)
    throw new Error("Writing revision history could not be merged safely.");
  const headId = tips.includes(current.headId) ? current.headId : tips[0];
  const head = revisions.find((revision) => revision.id === headId)!;
  return {
    ...current,
    revisions,
    tips,
    headId,
    updatedAt:
      Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt)
        ? incoming.updatedAt
        : current.updatedAt,
    view: {
      start: Math.min(current.view.start, head.text.length),
      end: Math.min(current.view.end, head.text.length),
      scrollTop: current.view.scrollTop,
    },
  };
}

/** Preview and merge keep every source ID. Shared-ID/content mismatches reject the batch. */
export function previewWritingRestore(
  current: WritingWorkspace,
  serialized: string,
): WritingRestorePreview {
  assertWritingWorkspace(current);
  if (
    typeof serialized !== "string" ||
    serialized.length > MAX_WRITING_BACKUP_BYTES
  )
    throw new Error("Choose a writing JSON backup smaller than 64 MB.");
  let incoming: unknown;
  try {
    incoming = JSON.parse(serialized);
  } catch {
    throw new Error(
      "This file is not a readable writing JSON backup. Existing writing is unchanged.",
    );
  }
  assertWritingWorkspace(incoming, current.owner);
  const byId = new Map(current.drafts.map((draft) => [draft.id, draft]));
  let newDrafts = 0,
    newRevisions = 0;
  for (const draft of incoming.drafts) {
    const existing = byId.get(draft.id);
    if (!existing) {
      byId.set(draft.id, draft);
      newDrafts += 1;
      newRevisions += draft.revisions.length;
    } else {
      const merged = mergeDraft(existing, draft);
      newRevisions += merged.revisions.length - existing.revisions.length;
      byId.set(draft.id, merged);
    }
  }
  const candidate = { ...current, drafts: [...byId.values()] };
  assertWritingWorkspace(candidate, current.owner);
  return {
    baseline: current,
    candidate,
    newDrafts,
    newRevisions,
    conflictDraftIds: candidate.drafts
      .filter((draft) => draft.tips.length > 1)
      .map((draft) => draft.id),
  };
}

export function confirmWritingRestore(
  current: WritingWorkspace,
  preview: WritingRestorePreview,
): WritingWorkspace {
  assertWritingWorkspace(current);
  if (!same(current, preview.baseline))
    throw new Error(
      "Your writing changed after this preview. Preview the backup again before restoring.",
    );
  assertWritingWorkspace(preview.candidate, current.owner);
  return preview.candidate;
}
