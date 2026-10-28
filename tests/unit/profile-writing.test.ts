import { describe, expect, it } from "vitest";
import {
  createWritingDraft,
  emptyWritingWorkspace,
  saveWritingRevision,
} from "@/domain/writing/workspace";
import { previewWritingRestore } from "@/domain/writing/restore";
import {
  inspectWritingProfile,
  previewWritingProfileRestore,
  serializeWritingProfileRecord,
  validateWritingProfileRestore,
} from "@/infrastructure/writing/repository";

const firstAt = "2026-10-26T12:00:00.000Z";
const nextAt = "2026-10-26T12:01:00.000Z";
function original() {
  return createWritingDraft(emptyWritingWorkspace(), {
    id: "draft-original",
    revisionId: "revision-original",
    title: "Original note",
    kind: "free",
    now: firstAt,
  });
}
function branch(text: string, revisionId: string) {
  return saveWritingRevision(original(), {
    draftId: "draft-original",
    baseId: "revision-original",
    revisionId,
    text,
    now: nextAt,
  });
}

describe("profile writing preservation", () => {
  it("keeps missing, present invalid null and unknown stored objects distinct", () => {
    expect(serializeWritingProfileRecord(undefined)).toBeNull();
    expect(serializeWritingProfileRecord(null)).toBe("null");
    expect(serializeWritingProfileRecord("{damaged workspace")).toBe(
      '"{damaged workspace"',
    );
    const newer = { version: 19, extra: { draft: "Kept unmodified 🌒" } };
    const before = structuredClone(newer);
    expect(JSON.parse(serializeWritingProfileRecord(newer)!)).toEqual(before);
    expect(newer).toEqual(before);
  });

  it("fails honestly when unknown stored data cannot be represented as JSON", () => {
    const cyclic: { draft: string; self?: unknown } = { draft: "Keep me" };
    cyclic.self = cyclic;
    expect(() => serializeWritingProfileRecord(cyclic)).toThrow(
      /original storage/u,
    );
    expect(cyclic.draft).toBe("Keep me");
    expect(cyclic.self).toBe(cyclic);
  });

  it("restores into an absent workspace without generating new source identities", () => {
    const next = branch("Independent original words.", "revision-a");
    const snapshot = validateWritingProfileRestore(next, null, null);
    expect(snapshot.signature).toBe(snapshot.raw);
    expect(JSON.parse(snapshot.raw!)).toEqual(next);
    expect(
      JSON.parse(snapshot.raw!).drafts[0].revisions.map(
        (revision: { id: string }) => revision.id,
      ),
    ).toEqual(["revision-original", "revision-a"]);
  });

  it("retains both concurrent revision branches and the current head in an additive plan", () => {
    const current = branch("First independent version.", "revision-a");
    const incoming = branch("A different independent version.", "revision-b");
    const currentRaw = JSON.stringify(current);
    const plan = previewWritingRestore(current, JSON.stringify(incoming));
    const restored = validateWritingProfileRestore(
      plan.candidate,
      currentRaw,
      currentRaw,
    );
    const next = JSON.parse(restored.raw!);
    expect(next.drafts[0].tips).toEqual(["revision-a", "revision-b"]);
    expect(next.drafts[0].headId).toBe("revision-a");
    expect(
      next.drafts[0].revisions.map(
        (revision: { text: string }) => revision.text,
      ),
    ).toEqual([
      "",
      "First independent version.",
      "A different independent version.",
    ]);
    expect(JSON.stringify(current)).toBe(currentRaw);
  });

  it("rejects a changed live baseline rather than replacing edits made after preview", () => {
    const current = branch("Current words.", "revision-a");
    const oldRaw = JSON.stringify(original());
    const currentRaw = JSON.stringify(current);
    expect(() =>
      validateWritingProfileRestore(original(), oldRaw, currentRaw),
    ).toThrow(/changed after the restore preview/u);
    expect(JSON.stringify(current)).toBe(currentRaw);
  });

  it("cannot discard an existing draft or revision by presenting a valid smaller workspace", () => {
    const current = branch("Keep this revision.", "revision-a");
    const currentRaw = JSON.stringify(current);
    for (const replacement of [emptyWritingWorkspace(), original()]) {
      expect(() =>
        validateWritingProfileRestore(replacement, currentRaw, currentRaw),
      ).toThrow(/discard a revision/u);
    }
    expect(JSON.stringify(current)).toBe(currentRaw);
  });

  it("rejects reuse of a revision identifier for different writing", () => {
    const current = branch("Original words.", "revision-a");
    const replacement = branch(
      "Altered words with an existing ID.",
      "revision-a",
    );
    const raw = JSON.stringify(current);
    expect(() => validateWritingProfileRestore(replacement, raw, raw)).toThrow(
      /conflicting contents/u,
    );
    expect(JSON.stringify(current)).toBe(raw);
  });

  it("does not assign another owner's workspace to the local profile", () => {
    const foreign = { ...original(), owner: "other-account" };
    expect(() => validateWritingProfileRestore(foreign, null, null)).toThrow(
      /another profile/u,
    );
  });

  it("resumes idempotently when the exact planned result committed before its journal receipt", () => {
    const next = branch("A committed revision.", "revision-a");
    const after = JSON.stringify(next);
    expect(validateWritingProfileRestore(next, null, after)).toEqual({
      raw: after,
      signature: after,
    });
    expect(JSON.parse(after).drafts[0].revisions).toHaveLength(2);
  });

  it("does not replace damaged stored data with an empty workspace", () => {
    const next = original();
    for (const raw of ["{bad JSON", "null", '"legacy unreadable writing"']) {
      expect(() => validateWritingProfileRestore(next, raw, raw)).toThrow();
    }
  });

  it("inspects validated local writing without turning absence into valid empty data", () => {
    expect(inspectWritingProfile(null)).toEqual({
      status: "absent",
      counts: { drafts: 0, revisions: 0, conflicts: 0 },
    });
    expect(
      inspectWritingProfile(
        JSON.stringify(branch("My own words.", "revision-a")),
      ),
    ).toEqual({
      status: "valid",
      counts: { drafts: 1, revisions: 2, conflicts: 0 },
    });
    for (const raw of ["{bad", "null", '"old writing"'])
      expect(inspectWritingProfile(raw).status).toBe("opaque");
  });

  it("marks unrecognized nested v1 fields opaque and blocks merges on either side", () => {
    const value = original();
    const variants = [
      { ...value, futureMetadata: "Preserve this" },
      {
        ...value,
        drafts: [{ ...value.drafts[0], annotations: ["Future annotation"] }],
      },
      {
        ...value,
        drafts: [
          {
            ...value.drafts[0],
            view: { ...value.drafts[0].view, futureAnchor: "paragraph-3" },
          },
        ],
      },
      {
        ...value,
        drafts: [
          {
            ...value.drafts[0],
            revisions: [
              { ...value.drafts[0].revisions[0], feedback: "Future feedback" },
            ],
          },
        ],
      },
    ];
    for (const variant of variants) {
      const raw = JSON.stringify(variant);
      expect(inspectWritingProfile(raw).status).toBe("opaque");
      expect(serializeWritingProfileRecord(variant)).toBe(raw);
      expect(() => previewWritingProfileRestore(null, raw)).toThrow(
        /unrecognized fields/u,
      );
      expect(() =>
        previewWritingProfileRestore(raw, JSON.stringify(value)),
      ).toThrow(/unrecognized fields/u);
      expect(() => validateWritingProfileRestore(variant, null, null)).toThrow(
        /unrecognized fields/u,
      );
      expect(JSON.stringify(variant)).toBe(raw);
    }
  });

  it("previews additive branches, counts and stable identities before any storage write", () => {
    const current = branch("Current text.", "revision-a");
    const incoming = branch("Restored text.", "revision-b");
    const currentRaw = JSON.stringify(current);
    const incomingRaw = JSON.stringify(incoming);
    const preview = previewWritingProfileRestore(currentRaw, incomingRaw);
    expect(preview.expectedRaw).toBe(currentRaw);
    expect(preview.changed).toBe(true);
    expect(preview.counts).toEqual({
      drafts: 1,
      revisions: 3,
      conflicts: 1,
      newDrafts: 0,
      newRevisions: 1,
    });
    expect(preview.conflictDraftIds).toEqual(["draft-original"]);
    expect(preview.warnings).toHaveLength(1);
    const restored = validateWritingProfileRestore(
      JSON.parse(preview.nextRaw!),
      preview.expectedRaw,
      currentRaw,
    );
    expect(restored.raw).toBe(preview.nextRaw);
    expect(JSON.parse(restored.raw!).drafts[0].tips).toEqual([
      "revision-a",
      "revision-b",
    ]);
    expect(JSON.stringify(current)).toBe(currentRaw);
    expect(JSON.stringify(incoming)).toBe(incomingRaw);
  });

  it("keeps exact original JSON on no-op and never deletes on missing incoming writing", () => {
    const workspace = branch("Existing words 🌒.", "revision-a");
    const raw = JSON.stringify(workspace, null, 2);
    const same = previewWritingProfileRestore(raw, JSON.stringify(workspace));
    expect(same.nextRaw).toBe(raw);
    expect(same.changed).toBe(false);
    const missing = previewWritingProfileRestore(raw, null);
    expect(missing.nextRaw).toBe(raw);
    expect(missing.changed).toBe(false);
    expect(missing.counts.newRevisions).toBe(0);
    expect(previewWritingProfileRestore(null, null).nextRaw).toBeNull();
  });

  it("rejects content collisions during preview rather than after earlier sections apply", () => {
    const current = branch("Keep this.", "revision-a");
    const incoming = branch("Different text.", "revision-a");
    expect(() =>
      previewWritingProfileRestore(
        JSON.stringify(current),
        JSON.stringify(incoming),
      ),
    ).toThrow(/conflicting contents/u);
  });
});
