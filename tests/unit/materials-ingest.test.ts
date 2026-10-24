import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  normalizeImportRows,
  parseDelimited,
} from "@/domain/imports/lexical-import";
import { emptyMaterialsState } from "@/domain/materials/types";
import {
  documentFromEpub,
  documentFromText,
} from "@/infrastructure/materials/epub";
import {
  archivePath,
  readBoundedZip,
} from "@/infrastructure/materials/archive";
import { rowsFromXlsx } from "@/infrastructure/materials/xlsx";
import {
  addDocument,
  addImportBatch,
  MATERIALS_STORAGE_KEY,
  MaterialsRepository,
  mergeMaterials,
  parseMaterialsState,
} from "@/infrastructure/materials/materials-repository";
import { purgeTemporaryDocumentContext } from "@/infrastructure/materials/context-retention";
import {
  createDictionaryContextLink,
  DICTIONARY_CONTEXT_KEY,
} from "@/infrastructure/dictionary/context-navigation";

const NOW = "2026-10-23T09:00:00.000Z";
function epub(extra: Record<string, Uint8Array> = {}) {
  return zipSync({
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    ),
    "OEBPS/content.opf": strToU8(
      '<package><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">A quiet book</dc:title></metadata><manifest><item id="a" href="chapter1.xhtml" media-type="application/xhtml+xml"/><item id="b" href="chapter2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
    ),
    "OEBPS/chapter1.xhtml": strToU8(
      '<html><head><title>Not reading text</title><script>steal()</script></head><body><h1>First chapter</h1><p>We <em>linger</em> by the sea &amp; listen.</p><script>window.bad = true</script><img src="https://example.invalid/private"/><form><p>Unsafe form</p></form></body></html>',
    ),
    "OEBPS/chapter2.xhtml": strToU8(
      "<html><body><h1>Second chapter</h1><p>Пример с кириллицей и IPA /ɪə/.</p></body></html>",
    ),
    ...extra,
  });
}

function xlsx(
  sheet = '<row r="1"><c r="A1" t="inlineStr"><is><t>Word</t></is></c><c r="B1" t="inlineStr"><is><t>Translation</t></is></c></row><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="inlineStr"><is><t>задерживаться</t></is></c><c r="C2"><f>HYPERLINK("https://bad.invalid")</f><v>cached malicious value</v></c></row>',
) {
  return zipSync({
    "xl/workbook.xml": strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Words" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/sharedStrings.xml": strToU8("<sst><si><t>linger</t></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet><sheetData>${sheet}</sheetData></worksheet>`,
    ),
  });
}

class MemoryStorage {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }
}

describe("bounded vocabulary import", () => {
  it("keeps quoted newlines, escaped quotes, BOM and mixed EN/RU exactly", async () => {
    const cells = await parseDelimited(
      '\uFEFFWord,Translation,Context\r\nlinger,"задерживаться, медлить","We said ""stay"".\nWe lingered."\r\n',
    );
    expect(cells[1]).toEqual([
      "linger",
      "задерживаться, медлить",
      'We said "stay".\nWe lingered.',
    ]);
    const rows = await normalizeImportRows(cells, "batch");
    expect(rows[0]).toMatchObject({
      term: "linger",
      rowNumber: 2,
      senseId: null,
      disposition: "pending",
    });
  });
  it("supports supplied Reverso-style tabular exports without accessing the account", async () => {
    const rows = await normalizeImportRows(
      await parseDelimited(
        "Original text\tTranslated text\tOriginal context\nlinger\tзадерживаться\tWe lingered.",
      ),
      "reverso",
    );
    expect(rows[0]).toMatchObject({
      term: "linger",
      translation: "задерживаться",
      context: "We lingered.",
      senseId: null,
    });
  });
  it("flags only exact duplicate contexts; distinct meanings and sources remain separate", async () => {
    const cells = [
      ["trace", "след", "a trace of rain", "book", "noun"],
      [" TRACE ", "след", "a trace of rain", "book", "noun"],
      ["trace", "проследить", "trace the path", "book", "verb"],
      ["trace", "след", "a trace of rain", "another book", "noun"],
    ];
    const rows = await normalizeImportRows(cells, "batch");
    expect(rows.map((row) => row.duplicateOf)).toEqual([
      undefined,
      rows[0].id,
      undefined,
      undefined,
    ]);
    expect(rows.every((row) => row.senseId === null)).toBe(true);
  });
  it("processes 1,001 rows in yielding chunks and reports final progress", async () => {
    let yields = 0;
    const text = Array.from(
      { length: 1001 },
      (_, index) => `word-${index};перевод-${index};context ${index}`,
    ).join("\n");
    const cells = await parseDelimited(text, ";", {
      yieldControl: async () => {
        yields++;
      },
    });
    const progress: number[] = [];
    const rows = await normalizeImportRows(cells, "large", {
      yieldControl: async () => {
        yields++;
      },
      onProgress: (done) => progress.push(done),
    });
    expect(rows).toHaveLength(1001);
    expect(yields).toBeGreaterThanOrEqual(12);
    expect(progress.at(-1)).toBe(1001);
  });
  it("cancels without returning a partial accepted batch", async () => {
    const controller = new AbortController();
    const cells = Array.from({ length: 1000 }, () => ["linger", "перевод"]);
    let count = 0;
    await expect(
      normalizeImportRows(cells, "cancel", {
        signal: controller.signal,
        yieldControl: async () => {
          if (++count === 2) controller.abort();
        },
      }),
    ).rejects.toThrow("cancelled");
  });
  it("rejects malformed quotes and overlong fields before persistence", async () => {
    await expect(parseDelimited('word,"unfinished')).rejects.toThrow(
      "unfinished",
    );
    await expect(parseDelimited('"word"oops,translation')).rejects.toThrow(
      "unexpected",
    );
    await expect(parseDelimited("x".repeat(10_001))).rejects.toThrow(
      "10,000-character",
    );
  });
  it("keeps spreadsheet-looking strings as inert text", async () => {
    const rows = await normalizeImportRows(
      await parseDelimited('"=HYPERLINK(""https://bad.invalid"")",text'),
      "inert",
    );
    expect(rows[0].term).toBe('=HYPERLINK("https://bad.invalid")');
    expect(rows[0].senseId).toBeNull();
  });
});

describe("private document ingest", () => {
  it("preserves text, paragraphs, source and stable structural identity", () => {
    const first = documentFromText(
      "\uFEFFWe linger.\r\n\r\nПример /ɪə/.",
      "My reading",
      "legal.txt",
      "txt",
      NOW,
    );
    const second = documentFromText(
      "\uFEFFWe linger.\r\n\r\nПример /ɪə/.",
      "Other title",
      "legal.txt",
      "txt",
      NOW,
    );
    expect(first.id).toBe(second.id);
    expect(first.chapters[0].paragraphs).toEqual([
      "We linger.",
      "Пример /ɪə/.",
    ]);
    expect(first.position).toMatchObject({
      chapterId: first.chapters[0].id,
      paragraphIndex: 0,
      characterOffset: 0,
    });
  });
  it("opens a real two-chapter EPUB ZIP and renders only inert readable text", async () => {
    const document = await documentFromEpub(epub(), "legal.epub", NOW);
    expect(document.title).toBe("A quiet book");
    expect(document.chapters).toHaveLength(2);
    const text = document.chapters
      .flatMap((chapter) => chapter.paragraphs)
      .join("\n");
    expect(text).toContain("We linger by the sea & listen.");
    expect(text).toContain("Пример с кириллицей");
    expect(text).not.toMatch(/steal|window.bad|Unsafe form|https:/u);
  });
  it("rejects DRM/encryption, external XML entities and missing chapter files", async () => {
    await expect(
      documentFromEpub(
        epub({ "META-INF/encryption.xml": strToU8("<encryption/>") }),
        "book.epub",
        NOW,
      ),
    ).rejects.toThrow("Encrypted");
    await expect(
      documentFromEpub(
        epub({
          "OEBPS/chapter1.xhtml": strToU8(
            '<!DOCTYPE html [<!ENTITY secret SYSTEM "file:///etc/passwd">]><html><body>&secret;</body></html>',
          ),
        }),
        "book.epub",
        NOW,
      ),
    ).rejects.toThrow("external entities");
    await expect(
      documentFromEpub(
        epub({
          "OEBPS/content.opf": strToU8(
            '<package><metadata/><manifest><item id="a" href="https://bad.invalid/chapter" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>',
          ),
        }),
        "book.epub",
        NOW,
      ),
    ).rejects.toThrow("unsafe file path");
  });
  it("rejects path traversal, duplicate normalized names, zip bombs and corrupted bytes", async () => {
    await expect(
      readBoundedZip(zipSync({ "../escape.txt": strToU8("bad") })),
    ).rejects.toThrow("outside");
    await expect(
      readBoundedZip(
        zipSync({
          "a/./test.txt": strToU8("one"),
          "a/test.txt": strToU8("two"),
        }),
      ),
    ).rejects.toThrow("duplicate");
    await expect(
      readBoundedZip(zipSync({ "bomb.txt": strToU8("x".repeat(300_000)) })),
    ).rejects.toThrow("decompression limits");
    const damaged = epub();
    damaged[damaged.length - 1] ^= 1;
    await expect(readBoundedZip(damaged)).rejects.toThrow("complete");
    expect(() => archivePath("../../outside", "OEBPS/content.opf")).toThrow(
      "outside",
    );
  });
  it("reads XLSX shared/inline strings and skips formulas without evaluating them", async () => {
    const result = await rowsFromXlsx(xlsx());
    expect(result.sheetName).toBe("Words");
    expect(result.skippedFormulas).toBe(1);
    expect(result.cells).toEqual([
      ["Word", "Translation"],
      ["linger", "задерживаться", ""],
    ]);
  });
  it("rejects unbounded XLSX columns and non-workbook archives", async () => {
    await expect(
      rowsFromXlsx(xlsx('<row><c r="ZZ1"><v>1</v></c></row>')),
    ).rejects.toThrow("32-column");
    await expect(rowsFromXlsx(epub())).rejects.toThrow("not a supported XLSX");
  });
});

describe("materials persistence and restore", () => {
  it("deleting a source removes its temporary excerpts without removing another source", () => {
    const storage = new MemoryStorage();
    for (const id of ["one", "two"])
      createDictionaryContextLink(
        {
          surface: "linger",
          excerpt: `${id} private excerpt`,
          returnHref: `/reader/${id}`,
          source: {
            documentId: id,
            documentVersion: "v1",
            chapterId: "first",
            paragraphIndex: 0,
            characterOffset: 0,
          },
        },
        storage,
        id,
      );
    purgeTemporaryDocumentContext("one", storage);
    expect(storage.getItem(DICTIONARY_CONTEXT_KEY)).not.toContain(
      "one private excerpt",
    );
    expect(storage.getItem(DICTIONARY_CONTEXT_KEY)).toContain(
      "two private excerpt",
    );
  });
  it("reloads private documents without touching learning v1", () => {
    const storage = new MemoryStorage();
    storage.values.set("lexis.learning.v1", "existing learning bytes");
    const repository = new MaterialsRepository(storage);
    const document = documentFromText(
      "A private text.",
      "My text",
      "text.txt",
      "txt",
      NOW,
    );
    const next = addDocument(repository.read().state, document);
    repository.commit(next, null);
    expect(repository.read().state.documents[0]).toEqual(document);
    expect(storage.getItem("lexis.learning.v1")).toBe(
      "existing learning bytes",
    );
  });
  it("preserves corrupted bytes and rejects invalid anchors without hidden recovery", () => {
    const storage = new MemoryStorage();
    storage.values.set(MATERIALS_STORAGE_KEY, "damaged original bytes");
    expect(() => new MaterialsRepository(storage).read()).toThrow();
    expect(storage.getItem(MATERIALS_STORAGE_KEY)).toBe(
      "damaged original bytes",
    );
    const document = documentFromText("Text", "Title", "source", "txt", NOW);
    document.position.paragraphIndex = 500;
    expect(() =>
      parseMaterialsState({ ...emptyMaterialsState(), documents: [document] }),
    ).toThrow("position");
  });
  it("detects stale tabs and storage quota without publishing a false success", () => {
    const storage = new MemoryStorage();
    const repository = new MaterialsRepository(storage);
    const snapshot = repository.read();
    storage.values.set(MATERIALS_STORAGE_KEY, "other tab bytes");
    expect(() =>
      repository.commit(snapshot.state, snapshot.serialized),
    ).toThrow("another tab");
    storage.values.delete(MATERIALS_STORAGE_KEY);
    storage.fail = true;
    expect(() => repository.commit(snapshot.state, null)).toThrow("Quota");
    expect(storage.getItem(MATERIALS_STORAGE_KEY)).toBeNull();
  });
  it("exports/restores idempotently and retains the current document position", async () => {
    const document = documentFromText(
      "First.\n\nSecond.",
      "Text",
      "source",
      "txt",
      NOW,
    );
    const batch = {
      id: "batch",
      sourceName: "words.csv",
      format: "csv" as const,
      createdAt: NOW,
      rows: await normalizeImportRows([["linger", "перевод"]], "batch"),
    };
    const state = addImportBatch(
      addDocument(emptyMaterialsState(), document),
      batch,
    );
    const backup = parseMaterialsState(JSON.parse(JSON.stringify(state)));
    const restored = mergeMaterials(emptyMaterialsState(), backup);
    expect(restored.documents).toEqual(state.documents);
    expect(restored.batches).toEqual(state.batches);
    const current = structuredClone(restored);
    current.documents[0].position.paragraphIndex = 1;
    const repeated = mergeMaterials(current, backup);
    expect(repeated.documents).toHaveLength(1);
    expect(repeated.documents[0].position.paragraphIndex).toBe(1);
    expect(repeated.batches).toHaveLength(1);
  });
  it("rejects conflicting restore data atomically and keeps archive history", async () => {
    const batch = {
      id: "batch",
      sourceName: "words.csv",
      format: "csv" as const,
      createdAt: NOW,
      rows: await normalizeImportRows([["linger", "перевод"]], "batch"),
    };
    const state = addImportBatch(emptyMaterialsState(), batch);
    const backup = structuredClone(state);
    backup.batches[0].rows[0].context = "Conflicting revision";
    expect(() => mergeMaterials(state, backup)).toThrow("conflicts");
    expect(state.batches[0].rows[0].context).toBe("");
    const document = documentFromText(
      "Private text",
      "Title",
      "source",
      "txt",
      NOW,
    );
    document.archivedAt = NOW;
    expect(
      parseMaterialsState(addDocument(state, document)).documents[0].archivedAt,
    ).toBe(NOW);
  });
});
