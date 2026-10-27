import {
  PROFILE_LOCAL_SECTIONS,
  PROFILE_SECTION_KEYS,
  inspectProfileSection,
  previewProfileSectionRestore,
  type ProfileLocalSectionId,
} from "@/application/profile-sections";
import { ProfileRestoreCoordinator } from "@/application/profile-recovery";
import {
  PROFILE_JSON_SECTIONS,
  type ProfileJsonSectionId,
} from "@/domain/profile-backup";
import type {
  ProfileRestoreMarker,
  ProfileRestorePayload,
  ProfileRestoreStep,
} from "@/domain/profile-recovery";
import type { WritingWorkspace } from "@/domain/writing/workspace";
import {
  inspectWritingProfile,
  previewWritingProfileRestore,
  readWritingProfileSnapshot,
  applyWritingProfileRestore,
} from "@/infrastructure/writing/repository";
import {
  readMediaBackupSnapshot,
  readMediaBackupAsset,
  readMediaBackupSession,
  restoreMediaBackupAsset,
  restoreMediaBackupSession,
  sniffMedia,
} from "@/infrastructure/listening/media-repository";
import {
  verifyMediaBackupSnapshot,
  parseMediaBackupAsset,
  canonicalMediaSession,
  previewMediaBackupRestore,
  mediaBackupAssetFingerprint,
  mediaBackupSessionFingerprint,
  sha256MediaBytes,
  type MediaBackupSnapshot,
} from "./media-backup";
import {
  createProfileBackupContainer,
  createProfileJsonBody,
  hashProfileRaw,
  openProfileBackupContainer,
  parseProfileJsonBody,
  type OpenProfileBackupContainer,
  type ProfileContainerInputPart,
  type ProfileContainerOptions,
} from "./container";
import {
  assertProfileNotPurging,
  assertProfileRestoreWrite,
} from "./operation";
import { BrowserProfileRestoreJournal } from "./restore-journal";
import { prepareBrowserProfileRestore } from "@/infrastructure/materials/purge-signal";

export interface ProfileInventorySection {
  id: ProfileJsonSectionId;
  status: "absent" | "valid" | "opaque" | "unavailable";
  counts: Record<string, number>;
  error?: string;
}
export interface BrowserProfileInventory {
  sections: ProfileInventorySection[];
}
export interface ProfileBackupSelection {
  sections: readonly ProfileJsonSectionId[];
  settings?: "keep-current" | "incoming";
}
export interface BrowserProfileRestorePreview {
  file: OpenProfileBackupContainer;
  rows: (ProfileInventorySection & {
    changed: boolean;
    warnings: string[];
    conflict?: string;
  })[];
  warnings: string[];
  /** Only the reviewed, additive target plan is staged. No source is modified by preview. */
  marker: ProfileRestoreMarker | null;
  payloads: Record<string, ProfileRestorePayload>;
}
const localSection = (id: string): id is ProfileLocalSectionId =>
  (PROFILE_LOCAL_SECTIONS as readonly string[]).includes(id);
const message = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;
const rawHash = (raw: string | null) =>
  raw === null ? Promise.resolve(null) : hashProfileRaw(raw);
function check(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException(
      "Profile operation cancelled. Saved source data is preserved.",
      "AbortError",
    );
  assertProfileNotPurging(window.localStorage);
}
function selected(
  input: readonly ProfileJsonSectionId[],
): ProfileJsonSectionId[] {
  if (
    new Set(input).size !== input.length ||
    input.some((id) => !PROFILE_JSON_SECTIONS.includes(id))
  )
    throw new Error("Choose supported profile sections only.");
  return [...input];
}
function readLocal(id: ProfileLocalSectionId): string | null {
  assertProfileNotPurging(window.localStorage);
  return window.localStorage.getItem(PROFILE_SECTION_KEYS[id]);
}
async function partBytes(body: Blob): Promise<Uint8Array> {
  return new Uint8Array(await body.arrayBuffer());
}
function payloadRaw(payload: ProfileRestorePayload): string | null {
  return parseProfileJsonBody(
    new TextDecoder("utf-8", { fatal: true }).decode(payload.bytes),
  );
}

/** Inspection is read-only and never creates absent feature databases. */
export async function inspectBrowserProfile(
  options: ProfileContainerOptions = {},
): Promise<BrowserProfileInventory> {
  check(options.signal);
  const sections: ProfileInventorySection[] = PROFILE_LOCAL_SECTIONS.map(
    (id) => {
      try {
        return inspectProfileSection(id, readLocal(id));
      } catch {
        return {
          id,
          status: "unavailable",
          counts: {},
          error: "This local store could not be read. No data was changed.",
        };
      }
    },
  );
  try {
    const writing = await readWritingProfileSnapshot();
    sections.push({ id: "writing", ...inspectWritingProfile(writing.raw) });
  } catch (cause) {
    sections.push({
      id: "writing",
      status: "unavailable",
      counts: {},
      error: message(cause, "Writing storage could not be inspected."),
    });
  }
  try {
    const media = await readMediaBackupSnapshot({ signal: options.signal });
    sections.push({
      id: "media-metadata",
      status: media.assets.length || media.sessions.length ? "valid" : "absent",
      counts: {
        recordings: media.assets.length,
        sessions: media.sessions.length,
      },
    });
  } catch (cause) {
    check(options.signal);
    sections.push({
      id: "media-metadata",
      status: "unavailable",
      counts: {},
      error: message(
        cause,
        "Media storage could not be inspected. Export other sections separately.",
      ),
    });
  }
  check(options.signal);
  return { sections };
}

/** A local file, not an upload. Exact malformed local strings remain opaque rescue attachments. */
export async function exportBrowserProfile(
  selection: ProfileBackupSelection,
  options: ProfileContainerOptions = {},
): Promise<Blob> {
  const ids = selected(selection.sections);
  if (!ids.length) throw new Error("Choose at least one section to export.");
  check(options.signal);
  const raw = new Map<ProfileJsonSectionId, string | null>();
  const parts: ProfileContainerInputPart[] = [];
  let media: MediaBackupSnapshot | undefined;
  for (const id of ids) {
    check(options.signal);
    let source: string | null, status: "absent" | "valid" | "opaque";
    if (localSection(id)) {
      source = readLocal(id);
      status = inspectProfileSection(id, source).status;
    } else if (id === "writing") {
      source = (await readWritingProfileSnapshot()).raw;
      status = inspectWritingProfile(source).status;
    } else {
      media = await readMediaBackupSnapshot({ signal: options.signal });
      source = JSON.stringify(media);
      status = "valid";
    }
    raw.set(id, source);
    parts.push({
      id: `section:${id}` as const,
      kind: "json",
      section: id,
      validation:
        status === "opaque" ? ("opaque" as const) : ("valid" as const),
      body: createProfileJsonBody(source),
    });
  }
  if (media)
    for (const metadata of media.assets) {
      check(options.signal);
      const asset = await readMediaBackupAsset(metadata.id, metadata.sha256, {
        signal: options.signal,
      });
      if (!asset)
        throw new Error(
          "A selected recording is unavailable. Export again after checking Listening.",
        );
      parts.push({
        id: `asset:${metadata.id}`,
        kind: "media",
        body: asset.blob,
      });
    }
  const file = await createProfileBackupContainer({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    parts,
    ...options,
  });
  // No best-effort snapshot is advertised as a complete export after an intervening autosave.
  for (const [id, before] of raw) {
    check(options.signal);
    const after = localSection(id)
      ? readLocal(id)
      : id === "writing"
        ? (await readWritingProfileSnapshot()).raw
        : JSON.stringify(
            await readMediaBackupSnapshot({ signal: options.signal }),
          );
    if (before !== after)
      throw new Error(
        "Your profile changed while the copy was being prepared. Saved work is intact; stop playback or finish saving, then export again.",
      );
  }
  check(options.signal);
  return file;
}

export async function openBrowserProfileBackup(
  file: Blob,
  options: ProfileContainerOptions = {},
): Promise<OpenProfileBackupContainer> {
  check(options.signal);
  const container = await openProfileBackupContainer(file, options);
  await container.verifyAll();
  // Media cannot smuggle an unreferenced binary part through a valid outer manifest.
  const metadataPart = container.manifest.parts.find(
    (part) => part.id === "section:media-metadata",
  );
  const binaries = container.manifest.parts.filter(
    (part) => part.kind === "media",
  );
  if (binaries.length && !metadataPart)
    throw new Error(
      "This backup contains recordings without their metadata. Existing data is unchanged.",
    );
  if (metadataPart) {
    const raw = parseProfileJsonBody(
      await container.readJsonPart(metadataPart.id),
    );
    if (raw === null) {
      if (binaries.length)
        throw new Error("This backup has incomplete media metadata.");
    } else {
      const media = await verifyMediaBackupSnapshot(JSON.parse(raw));
      if (
        binaries.length !== media.assets.length ||
        media.assets.some(
          (asset) =>
            !binaries.some(
              (part) =>
                part.id === `asset:${asset.id}` &&
                part.sha256 === asset.sha256 &&
                part.byteLength === asset.byteLength,
            ),
        )
      )
        throw new Error(
          "This backup's recording list does not match its media parts. Nothing was restored.",
        );
    }
  }
  return container;
}

export async function previewBrowserProfileRestore(
  file: OpenProfileBackupContainer,
  selection: ProfileBackupSelection,
  options: ProfileContainerOptions = {},
): Promise<BrowserProfileRestorePreview> {
  check(options.signal);
  const ids = selected(selection.sections),
    rows: BrowserProfileRestorePreview["rows"] = [],
    warnings: string[] = [];
  const steps: ProfileRestoreStep[] = [],
    payloads: Record<string, ProfileRestorePayload> = {};
  const projected = new Map<
    ProfileLocalSectionId,
    ReturnType<typeof inspectProfileSection>
  >();
  async function addRaw(
    id: ProfileJsonSectionId,
    before: string | null,
    after: string | null,
  ) {
    if (after === null) return;
    const step: ProfileRestoreStep = {
      id: `section:${id}`,
      kind: id === "writing" ? "writing" : "local",
      target: id === "writing" ? "local" : id,
      beforeHash: await rawHash(before),
      afterHash: await hashProfileRaw(after),
    };
    steps.push(step);
    payloads[step.id] = {
      bytes: await partBytes(createProfileJsonBody(after)),
    };
  }
  for (const id of ids) {
    check(options.signal);
    const part = file.manifest.parts.find(
      (item) => item.kind === "json" && item.section === id,
    );
    if (!part || part.kind !== "json") continue;
    try {
      const incoming = parseProfileJsonBody(await file.readJsonPart(part.id));
      if (part.validation === "opaque")
        throw new Error(
          "This section was exported as unvalidated original data. Keep the file for recovery; it cannot be merged by this app version.",
        );
      if (localSection(id)) {
        const result = previewProfileSectionRestore(
          id,
          readLocal(id),
          incoming,
          { settings: selection.settings },
        );
        const inspection = inspectProfileSection(id, result.nextRaw);
        projected.set(id, inspection);
        rows.push({
          ...inspection,
          changed: result.changed,
          warnings: result.warnings,
        });
        await addRaw(id, result.expectedRaw, result.nextRaw);
      } else if (id === "writing") {
        const result = previewWritingProfileRestore(
          (await readWritingProfileSnapshot()).raw,
          incoming,
        );
        rows.push({
          id,
          ...inspectWritingProfile(result.nextRaw),
          changed: result.changed,
          warnings: result.warnings,
        });
        await addRaw(id, result.expectedRaw, result.nextRaw);
      } else if (incoming !== null) {
        const media = await verifyMediaBackupSnapshot(JSON.parse(incoming));
        const current = await readMediaBackupSnapshot({
          signal: options.signal,
        });
        const result = previewMediaBackupRestore(current, media);
        if (result.conflicts.length)
          throw new Error(
            result.conflicts.map((item) => item.reason).join(" "),
          );
        for (const asset of media.assets) {
          check(options.signal);
          const existing = current.assets.find((item) => item.id === asset.id);
          const step: ProfileRestoreStep = {
            id: `asset:${asset.id}`,
            kind: "media-asset",
            target: asset.id,
            beforeHash: existing
              ? await mediaBackupAssetFingerprint(existing)
              : null,
            afterHash: await mediaBackupAssetFingerprint(asset),
          };
          steps.push(step);
          payloads[step.id] = {
            bytes: await partBytes(await file.readPart(step.id)),
            metadata: JSON.stringify(asset),
          };
        }
        for (let index = 0; index < media.sessions.length; index++) {
          const session = media.sessions[index],
            existing = current.sessions.find((item) => item.id === session.id);
          const step: ProfileRestoreStep = {
            id: `media-session:${index}`,
            kind: "media-session",
            target: session.sourceId,
            beforeHash: existing
              ? await mediaBackupSessionFingerprint(existing)
              : null,
            afterHash: await mediaBackupSessionFingerprint(session),
          };
          steps.push(step);
          payloads[step.id] = {
            bytes: new TextEncoder().encode(JSON.stringify(session)),
          };
        }
        rows.push({
          id,
          status: "valid",
          counts: {
            recordings: media.assets.length,
            sessions: media.sessions.length,
          },
          changed: !!(result.assetsToAdd.length || result.sessionsToAdd.length),
          warnings: result.warnings.length
            ? [
                "Some listening sessions refer to unavailable recordings. Their transcripts and history will be preserved.",
              ]
            : [],
        });
      } else
        rows.push({
          id,
          status: "absent",
          counts: {},
          changed: false,
          warnings: [],
        });
    } catch (cause) {
      check(options.signal);
      rows.push({
        id,
        status: "opaque",
        counts: {},
        changed: false,
        warnings: [],
        conflict: message(
          cause,
          "This section cannot be merged safely. Keep both copies.",
        ),
      });
    }
  }
  // Missing referenced content is retained as unavailable; IDs are never rebound to a different sense/source.
  for (const id of PROFILE_LOCAL_SECTIONS)
    if (!projected.has(id))
      projected.set(id, inspectProfileSection(id, readLocal(id)));
  const catalogIds = new Set(
    projected.get("catalog")?.references.catalogSenseIds ?? [],
  );
  const ownReferences = [...projected.values()]
    .flatMap((item) => [
      ...(item.references.savedSenseIds ?? []),
      ...(item.references.targetSenseIds ?? []),
    ])
    .filter((id) => id.startsWith("user-sense-"));
  if (ownReferences.some((id) => !catalogIds.has(id)))
    warnings.push(
      "Some saved meanings refer to definitions outside the selected catalog. Their IDs and history are preserved; unavailable entries can be restored with their matching catalog later.",
    );
  const documents = new Set(
    projected.get("materials")?.references.documentIds ?? [],
  );
  if (
    (projected.get("sense-contexts")?.references.sourceDocumentIds ?? []).some(
      (id) => !documents.has(id),
    )
  )
    warnings.push(
      "Some saved passages have no matching selected book. The passage and original source address will be preserved.",
    );
  const attempts = new Set(projected.get("tasks")?.references.attemptIds ?? []);
  if (
    (
      projected.get("practice-session")?.references.practiceAttemptIds ?? []
    ).some((id) => !attempts.has(id))
  )
    warnings.push(
      "The practice position refers to task attempts outside the selected history. Include Tasks to restore that history too.",
    );
  const now = new Date().toISOString();
  check(options.signal);
  return {
    file,
    rows,
    warnings,
    marker:
      steps.length && !rows.some((row) => row.conflict)
        ? {
            version: 1,
            id: crypto.randomUUID(),
            owner: "local",
            fileHash: file.fileHash,
            epoch: crypto.randomUUID(),
            status: "staged",
            startedAt: now,
            updatedAt: now,
            steps,
            completed: [],
          }
        : null,
    payloads,
  };
}

/** This special command path is scoped to an explicit running journal, never an ambient guard bypass. */
export function browserProfileRestoreCoordinator(): ProfileRestoreCoordinator {
  return new ProfileRestoreCoordinator({
    journal: new BrowserProfileRestoreJournal(),
    prepare: prepareBrowserProfileRestore,
    targets: {
      async verifyPayload(step, payload) {
        if (step.kind === "local" || step.kind === "writing") {
          const raw = payloadRaw(payload);
          if (raw === null || (await hashProfileRaw(raw)) !== step.afterHash)
            throw new Error(
              "This staged section does not match its confirmed fingerprint.",
            );
          const inspection =
            step.kind === "writing" && step.target === "local"
              ? inspectWritingProfile(raw)
              : step.kind === "local" && localSection(step.target)
                ? inspectProfileSection(step.target, raw)
                : null;
          if (inspection?.status !== "valid")
            throw new Error(
              "This staged section cannot be validated for its confirmed owner and target.",
            );
        } else if (step.kind === "media-asset") {
          const metadata = parseMediaBackupAsset(
            JSON.parse(payload.metadata ?? "null"),
          );
          const bytes = new Uint8Array(payload.bytes).buffer;
          if (
            metadata.id !== step.target ||
            metadata.byteLength !== bytes.byteLength ||
            (await sha256MediaBytes(bytes)) !== metadata.sha256 ||
            (await mediaBackupAssetFingerprint(metadata)) !== step.afterHash
          )
            throw new Error(
              "This staged recording does not match its confirmed metadata and bytes.",
            );
          const actual = sniffMedia(
            new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength)),
            metadata.fileName,
            metadata.mime,
          );
          if (actual.kind !== metadata.kind || actual.mime !== metadata.mime)
            throw new Error(
              "This staged recording has an unsupported or mislabeled format.",
            );
        } else {
          const session = canonicalMediaSession(
            JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(payload.bytes),
            ),
          );
          if (
            session.sourceId !== step.target ||
            (await mediaBackupSessionFingerprint(session)) !== step.afterHash
          )
            throw new Error(
              "This staged listening session does not match its confirmed source and history.",
            );
        }
      },
      async readCurrentHash(step) {
        assertProfileNotPurging(window.localStorage);
        if (step.kind === "local") {
          if (!localSection(step.target))
            throw new Error("Unsupported profile target.");
          return rawHash(readLocal(step.target));
        }
        if (step.kind === "writing") {
          if (step.target !== "local")
            throw new Error("Unsupported writing owner.");
          return rawHash((await readWritingProfileSnapshot()).raw);
        }
        if (step.kind === "media-session") {
          const session = await readMediaBackupSession(step.target);
          return session ? mediaBackupSessionFingerprint(session) : null;
        }
        const asset = await readMediaBackupAsset(step.target);
        if (!asset) return null;
        const { blob, ...metadata } = asset;
        return mediaBackupAssetFingerprint({
          ...metadata,
          sha256: await sha256MediaBytes(await blob.arrayBuffer()),
        });
      },
      async apply(step, payload, operationId) {
        const marker = assertProfileRestoreWrite(operationId);
        if (
          !marker.steps.some(
            (item) => JSON.stringify(item) === JSON.stringify(step),
          )
        )
          throw new Error(
            "This change is outside the confirmed recovery plan.",
          );
        if (step.kind === "local" || step.kind === "writing") {
          const next = payloadRaw(payload);
          if (next === null || (await hashProfileRaw(next)) !== step.afterHash)
            throw new Error(
              "The staged section does not match the confirmed restore.",
            );
          if (step.kind === "writing") {
            const current = await readWritingProfileSnapshot();
            if ((await rawHash(current.raw)) !== step.beforeHash)
              throw new Error(
                "Writing changed after preview. Existing revisions are preserved.",
              );
            await applyWritingProfileRestore(
              JSON.parse(next) as WritingWorkspace,
              current.signature,
              operationId,
            );
          } else {
            if (!localSection(step.target))
              throw new Error("Unsupported profile target.");
            const before = readLocal(step.target);
            if ((await rawHash(before)) !== step.beforeHash)
              throw new Error(
                "This profile section changed after preview. It was not overwritten.",
              );
            assertProfileRestoreWrite(operationId);
            // Synchronous CAS and put contain no await where another event can intervene.
            if (readLocal(step.target) !== before)
              throw new Error(
                "Another tab changed this section. No data was overwritten.",
              );
            window.localStorage.setItem(
              PROFILE_SECTION_KEYS[step.target],
              next,
            );
          }
        } else if (step.kind === "media-asset") {
          const metadata = parseMediaBackupAsset(
            JSON.parse(payload.metadata ?? "null"),
          );
          if (metadata.id !== step.target)
            throw new Error(
              "This recording has a different confirmed identity.",
            );
          await restoreMediaBackupAsset(
            metadata,
            new Blob([new Uint8Array(payload.bytes).buffer], {
              type: metadata.mime,
            }),
            null,
            operationId,
          );
        } else {
          const session = canonicalMediaSession(
            JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(payload.bytes),
            ),
          );
          if (session.sourceId !== step.target)
            throw new Error(
              "This listening session has a different confirmed source.",
            );
          await restoreMediaBackupSession(session, null, operationId);
        }
      },
    },
  });
}
