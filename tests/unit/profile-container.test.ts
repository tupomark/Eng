import { describe, expect, it } from "vitest";
import {
  parseProfileBackupManifest,
  PROFILE_BACKUP_LIMITS,
  type ProfileBackupManifest,
} from "@/domain/profile-backup";
import {
  createProfileBackupContainer,
  createProfileJsonBody,
  hashProfileBlob,
  hashProfileRaw,
  openProfileBackupContainer,
  parseProfileJsonBody,
  type ProfileContainerInputPart,
  type ProfileContainerProgress,
} from "@/infrastructure/profile/container";

const identity = {
  id: "b9619b8d-7c32-444a-9d8f-620ac4cd5155",
  createdAt: "2026-10-26T10:00:00.000Z",
};
const json = (
  raw: string | null,
  section: "learning" | "tasks" = "learning",
  validation: "valid" | "opaque" = "valid",
): ProfileContainerInputPart => ({
  id: `section:${section}` as const,
  kind: "json",
  section,
  validation,
  body: createProfileJsonBody(raw),
});
function descriptorManifest(): ProfileBackupManifest {
  return {
    version: 1,
    ...identity,
    scope: "local",
    parts: [
      {
        id: "section:learning",
        kind: "json",
        section: "learning",
        validation: "valid",
        byteLength: 8,
        sha256: "a".repeat(64),
      },
    ],
  };
}
function rawContainer(manifest: unknown, bodies: BlobPart[] = []): Blob {
  const text = new TextEncoder().encode(JSON.stringify(manifest));
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode("LEXISBK1"));
  new DataView(header.buffer).setUint32(8, text.byteLength, false);
  return new Blob([header, text, ...bodies]);
}
class CountingBlob extends Blob {
  reads = 0;
  override async arrayBuffer(): Promise<ArrayBuffer> {
    this.reads++;
    return super.arrayBuffer();
  }
}
class SparseOnlyFile extends Blob {
  wholeReads = 0;
  slices: { start: number; end: number }[] = [];
  override async arrayBuffer(): Promise<ArrayBuffer> {
    this.wholeReads++;
    throw new Error("Whole-file reads are forbidden in this test.");
  }
  override slice(start = 0, end = this.size, contentType?: string): Blob {
    this.slices.push({ start, end });
    return super.slice(start, end, contentType);
  }
}
class DeclaredSizeBlob extends Blob {
  reads = 0;
  constructor(private readonly declared: number) {
    super([]);
  }
  override get size() {
    return this.declared;
  }
  override async arrayBuffer(): Promise<ArrayBuffer> {
    this.reads++;
    throw new Error("Oversized content must not be read.");
  }
}

describe("portable profile container", () => {
  it("exports and verifies exact section strings plus binary bytes with an independently bound manifest", async () => {
    const raw = ' {"version":1,"context":"Свой текст 😀"} \n';
    const binary = new Uint8Array([0, 1, 2, 255, 128, 10]);
    const progress: ProfileContainerProgress[] = [];
    const file = await createProfileBackupContainer({
      ...identity,
      parts: [
        json(raw),
        { id: "asset:media-original", kind: "media", body: new Blob([binary]) },
      ],
      onProgress: (step) => progress.push(step),
    });
    const parsed = await openProfileBackupContainer(file);
    expect(parsed.manifest).toMatchObject({
      version: 1,
      ...identity,
      scope: "local",
    });
    expect(parsed.fileHash).toMatch(/^[a-f0-9]{64}$/u);
    expect((await openProfileBackupContainer(file)).fileHash).toBe(
      parsed.fileHash,
    );
    expect(
      parseProfileJsonBody(await parsed.readJsonPart("section:learning")),
    ).toBe(raw);
    expect(
      new Uint8Array(
        await (await parsed.readPart("asset:media-original")).arrayBuffer(),
      ),
    ).toEqual(binary);
    await parsed.verifyAll();
    expect(progress.at(-1)).toMatchObject({
      phase: "complete",
      completedParts: 2,
      totalParts: 2,
    });
    expect(
      progress
        .filter((step) => step.phase === "hashing")
        .map((step) => step.completedParts),
    ).toEqual([0, 1, 2]);
    expect(Object.isFrozen(parsed.manifest)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.parts)).toBe(true);
    expect(Object.isFrozen(parsed.manifest.parts[0])).toBe(true);
  });
  it("supports an empty selection without inventing default profile data", async () => {
    const parsed = await openProfileBackupContainer(
      await createProfileBackupContainer({ ...identity, parts: [] }),
    );
    expect(parsed.manifest.parts).toEqual([]);
    await parsed.verifyAll();
    await expect(parsed.readPart("section:learning")).rejects.toThrow(
      "not present",
    );
  });
  it("preserves absence, corrupt raw text, lone surrogates and pairs across encoding chunks", async () => {
    for (const raw of [
      null,
      "",
      "null",
      "{damaged \ud800 raw \udfff",
      "a".repeat(65_535) + "😀" + "\ud800",
    ]) {
      const body = createProfileJsonBody(raw);
      expect(parseProfileJsonBody(await body.text())).toBe(raw);
      const opened = await openProfileBackupContainer(
        await createProfileBackupContainer({
          ...identity,
          parts: [json(raw, "learning", "opaque")],
        }),
      );
      await opened.verifyAll();
      expect(opened.manifest.parts[0]).toMatchObject({ validation: "opaque" });
      expect(
        parseProfileJsonBody(await opened.readJsonPart("section:learning")),
      ).toBe(raw);
    }
    expect(
      new Set(
        await Promise.all(
          [null, "", "null", "\ud800", "�"].map((raw) => hashProfileRaw(raw)),
        ),
      ).size,
    ).toBe(5);
  });
  it.each([
    "null",
    '"text"',
    '{"raw":{}}',
    '{"raw":1}',
    '{"raw":null,"extra":true}',
    '{"other":null}',
    "{bad",
  ])(
    "rejects an invalid raw wrapper without silently normalizing it: %s",
    (text) => {
      expect(() => parseProfileJsonBody(text)).toThrow();
    },
  );
  it("only reads header, bounded manifest and one selected payload at a time", async () => {
    const file = new SparseOnlyFile([
      await createProfileBackupContainer({
        ...identity,
        parts: [json('{"saved":[]}'), json('{"tasks":[]}', "tasks")],
      }),
    ]);
    const opened = await openProfileBackupContainer(file);
    expect(file.slices[0]).toEqual({ start: 0, end: 12 });
    expect(file.slices).toHaveLength(2);
    await opened.verifyAll();
    expect(file.wholeReads).toBe(0);
    expect(file.slices).toHaveLength(4);
    expect(file.slices.every(({ start, end }) => end - start < file.size)).toBe(
      true,
    );
  });
  it("detects payload tampering even though the manifest fingerprint is unchanged", async () => {
    const file = await createProfileBackupContainer({
      ...identity,
      parts: [json('{"saved":[]}')],
    });
    const original = await openProfileBackupContainer(file);
    const altered = new Blob([
      file.slice(0, file.size - 1),
      new Uint8Array([0]),
    ]);
    const opened = await openProfileBackupContainer(altered);
    expect(opened.fileHash).toBe(original.fileHash);
    await expect(opened.readPart("section:learning")).rejects.toThrow(
      "integrity",
    );
    await expect(opened.verifyAll()).rejects.toThrow("integrity");
  });
  it("does not trust a valid or opaque JSON flag to permit invalid UTF-8", async () => {
    for (const validation of ["valid", "opaque"] as const) {
      const file = await createProfileBackupContainer({
        ...identity,
        parts: [
          {
            id: "section:learning",
            kind: "json",
            section: "learning",
            validation,
            body: new Blob([new Uint8Array([0xc3, 0x28])]),
          },
        ],
      });
      const opened = await openProfileBackupContainer(file);
      await expect(opened.readJsonPart("section:learning")).rejects.toThrow(
        "UTF-8",
      );
      await expect(opened.verifyAll()).rejects.toThrow("UTF-8");
    }
  });
  it("rejects media being requested as JSON and missing JSON parts", async () => {
    const opened = await openProfileBackupContainer(
      await createProfileBackupContainer({
        ...identity,
        parts: [
          {
            id: "asset:media-original",
            kind: "media",
            body: new Blob(["audio"]),
          },
        ],
      }),
    );
    await expect(opened.readJsonPart("asset:media-original")).rejects.toThrow(
      "not a profile JSON",
    );
    await expect(opened.readJsonPart("section:writing")).rejects.toThrow(
      "not a profile JSON",
    );
  });
  it("rejects truncated files, trailing bytes, wrong magic and oversized manifest lengths", async () => {
    const file = await createProfileBackupContainer({
      ...identity,
      parts: [json("null")],
    });
    const tooLongHeader = new Uint8Array(12);
    tooLongHeader.set(new TextEncoder().encode("LEXISBK1"));
    new DataView(tooLongHeader.buffer).setUint32(
      8,
      PROFILE_BACKUP_LIMITS.maxManifestBytes + 1,
      false,
    );
    for (const invalid of [
      file.slice(0, 5),
      file.slice(0, file.size - 1),
      new Blob([file, "x"]),
      new Blob(["WRONGMAG", file.slice(8)]),
      new Blob([tooLongHeader]),
      new Blob([tooLongHeader, new Uint8Array(16)]),
    ]) {
      await expect(openProfileBackupContainer(invalid)).rejects.toThrow();
    }
  });
  it("rejects unknown sections, account scopes, malformed hashes, unsafe names and duplicate parts", () => {
    const base = descriptorManifest();
    const bad: unknown[] = [
      { ...base, version: 2 },
      { ...base, scope: "account:another-owner" },
      { ...base, secret: "forbidden" },
      { ...base, createdAt: "yesterday" },
      { ...base, id: "not-a-uuid" },
      { ...base, parts: [...base.parts, ...base.parts] },
      {
        ...base,
        parts: [{ ...base.parts[0], id: "section:auth", section: "auth" }],
      },
      { ...base, parts: [{ ...base.parts[0], sha256: "z".repeat(64) }] },
      { ...base, parts: [{ ...base.parts[0], validation: ["valid"] }] },
      { ...base, parts: [{ ...base.parts[0], byteLength: -1 }] },
      { ...base, parts: [{ ...base.parts[0], byteLength: 1.5 }] },
      {
        ...base,
        parts: [{ ...base.parts[0], byteLength: Number.MAX_SAFE_INTEGER }],
      },
      {
        ...base,
        parts: [
          {
            id: "asset:../secrets",
            kind: "media",
            byteLength: 1,
            sha256: "a".repeat(64),
          },
        ],
      },
      {
        ...base,
        parts: [
          {
            id: "asset:media-original",
            kind: "media",
            byteLength: 0,
            sha256: "a".repeat(64),
          },
        ],
      },
      {
        ...base,
        parts: [
          {
            id: "asset:media-original",
            kind: "media",
            byteLength: 1,
            sha256: "a".repeat(64),
            section: "learning",
          },
        ],
      },
    ];
    for (const value of bad)
      expect(() => parseProfileBackupManifest(value)).toThrow();
  });
  it("rejects unsupported manifests during open rather than accepting their otherwise valid framing", async () => {
    const manifest = { ...descriptorManifest(), scope: "cloud" };
    await expect(
      openProfileBackupContainer(rawContainer(manifest, ["12345678"])),
    ).rejects.toThrow();
  });
  it("bounds individual parts and complete framed size before reading any oversized payload", async () => {
    const oversized = new DeclaredSizeBlob(
      PROFILE_BACKUP_LIMITS.maxJsonPartBytes + 1,
    );
    await expect(
      createProfileBackupContainer({
        ...identity,
        parts: [{ ...json(null), body: oversized }],
      }),
    ).rejects.toThrow();
    expect(oversized.reads).toBe(0);
    const bodies = Array.from(
      { length: 4 },
      () => new DeclaredSizeBlob(PROFILE_BACKUP_LIMITS.maxJsonPartBytes),
    );
    await expect(
      createProfileBackupContainer({
        ...identity,
        parts: bodies.map((body, index) => ({
          id: `section:${["learning", "tasks", "materials", "writing"][index]}`,
          kind: "json",
          section: ["learning", "tasks", "materials", "writing"][index],
          validation: "valid",
          body,
        })) as ProfileContainerInputPart[],
      }),
    ).rejects.toThrow();
    expect(bodies.every((body) => body.reads === 0)).toBe(true);
    await expect(
      openProfileBackupContainer(
        new DeclaredSizeBlob(PROFILE_BACKUP_LIMITS.maxFileBytes + 1),
      ),
    ).rejects.toThrow();
  });
  it("honours cancellation before I/O and between parts, without reading the remaining bodies", async () => {
    const stopped = new AbortController();
    stopped.abort();
    const first = new CountingBlob(["first"]);
    const second = new CountingBlob(["second"]);
    const parts: ProfileContainerInputPart[] = [
      { id: "asset:media-first", kind: "media", body: first },
      { id: "asset:media-second", kind: "media", body: second },
    ];
    await expect(
      createProfileBackupContainer({
        ...identity,
        parts,
        signal: stopped.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(first.reads).toBe(0);
    const controller = new AbortController();
    await expect(
      createProfileBackupContainer({
        ...identity,
        parts,
        signal: controller.signal,
        onProgress: (step) => {
          if (step.completedParts === 1) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(first.reads).toBe(1);
    expect(second.reads).toBe(0);
    await expect(
      openProfileBackupContainer(new Blob([]), { signal: stopped.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("honours cancellation during verification before progressing to another part", async () => {
    const file = await createProfileBackupContainer({
      ...identity,
      parts: [json("null"), json("null", "tasks")],
    });
    const controller = new AbortController();
    const completed: string[] = [];
    const opened = await openProfileBackupContainer(file, {
      signal: controller.signal,
      onProgress: (step) => {
        if (step.partId) completed.push(step.partId);
        if (step.completedParts === 1) controller.abort();
      },
    });
    await expect(opened.verifyAll()).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(completed).toEqual(["section:learning"]);
  });
  it("creates immutable manifest copies and preserves exact restored identities", () => {
    const input = JSON.parse(JSON.stringify(descriptorManifest()));
    const parsed = parseProfileBackupManifest(input);
    input.parts[0].sha256 = "b".repeat(64);
    input.id = "b9619b8d-7c32-444a-9d8f-620ac4cd5156";
    expect(parsed.id).toBe(identity.id);
    expect(parsed.parts[0].sha256).toBe("a".repeat(64));
  });
  it("uses real SHA-256, not a metadata-only size check", async () => {
    expect(await hashProfileBlob(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
