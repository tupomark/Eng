import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalBlobBytes } from "@/infrastructure/storage/read-blob";

class TestReader {
  static instances: TestReader[] = [];
  static constructionError = false;
  static readError = false;
  result: string | ArrayBuffer | null = null;
  error = new Error("Private blob:https://private.invalid/private-material");
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  reads = 0;
  aborts = 0;

  constructor() {
    if (TestReader.constructionError) throw this.error;
    TestReader.instances.push(this);
  }
  readAsArrayBuffer(_blob: Blob) {
    void _blob;
    this.reads++;
    if (TestReader.readError) throw this.error;
  }
  abort() {
    this.aborts++;
    this.onabort?.();
  }
  load(bytes: ArrayBuffer | string | null) {
    this.result = bytes;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}

function browser() {
  TestReader.instances = [];
  TestReader.constructionError = false;
  TestReader.readError = false;
  const page = new EventTarget();
  vi.stubGlobal("FileReader", TestReader);
  vi.stubGlobal("window", page);
  return page;
}

function cleared(reader: TestReader) {
  expect(reader.onload).toBeNull();
  expect(reader.onerror).toBeNull();
  expect(reader.onabort).toBeNull();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cancelable local Blob reads", () => {
  it("uses native FileReader, returns exact bytes and removes every listener on success", async () => {
    const page = browser();
    const add = vi.spyOn(page, "addEventListener");
    const remove = vi.spyOn(page, "removeEventListener");
    const controller = new AbortController();
    const signalRemove = vi.spyOn(controller.signal, "removeEventListener");
    const blob = new Blob([new Uint8Array([0, 255, 128])]);
    const arrayBuffer = vi.spyOn(blob, "arrayBuffer");
    const reading = readLocalBlobBytes(blob, { signal: controller.signal });
    const reader = TestReader.instances[0];
    const bytes = new Uint8Array([0, 255, 128]).buffer;
    reader.load(bytes);
    expect(await reading).toBe(bytes);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(reader.reads).toBe(1);
    expect(add).toHaveBeenCalledWith("pagehide", expect.any(Function), {
      once: true,
    });
    expect(remove).toHaveBeenCalledWith("pagehide", expect.any(Function));
    expect(signalRemove).toHaveBeenCalledWith("abort", expect.any(Function));
    cleared(reader);
    controller.abort();
    page.dispatchEvent(new Event("pagehide"));
    expect(reader.aborts).toBe(0);
  });

  it("rejects an already aborted request before creating or reading a native reader", async () => {
    browser();
    const controller = new AbortController();
    controller.abort();
    await expect(
      readLocalBlobBytes(new Blob(["private"]), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(TestReader.instances).toHaveLength(0);
  });

  it("aborts the native read on signal cancellation and ignores any late load", async () => {
    const page = browser();
    const remove = vi.spyOn(page, "removeEventListener");
    const controller = new AbortController();
    const reading = readLocalBlobBytes(new Blob(["private"]), {
      signal: controller.signal,
    });
    const reader = TestReader.instances[0];
    const lateLoad = reader.onload;
    controller.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(reader.aborts).toBe(1);
    expect(remove).toHaveBeenCalledWith("pagehide", expect.any(Function));
    cleared(reader);
    reader.result = new ArrayBuffer(10);
    lateLoad?.();
    page.dispatchEvent(new Event("pagehide"));
    expect(reader.aborts).toBe(1);
  });

  it("pagehide cancels native work even when the caller provided no AbortSignal", async () => {
    const page = browser();
    const reading = readLocalBlobBytes(new Blob(["private"]));
    const reader = TestReader.instances[0];
    page.dispatchEvent(new Event("pagehide"));
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(reader.aborts).toBe(1);
    cleared(reader);
    page.dispatchEvent(new Event("pagehide"));
    expect(reader.aborts).toBe(1);
  });

  it("handles native abort events without exposing original file errors", async () => {
    browser();
    const reading = readLocalBlobBytes(new Blob(["private"]));
    const reader = TestReader.instances[0];
    reader.onabort?.();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    cleared(reader);
  });

  it.each(["event", "read", "constructor", "invalid-result"] as const)(
    "wraps %s failures without leaking a temporary URL or private path",
    async (kind) => {
      const page = browser();
      const remove = vi.spyOn(page, "removeEventListener");
      TestReader.constructionError = kind === "constructor";
      TestReader.readError = kind === "read";
      const reading = readLocalBlobBytes(new Blob(["private"]));
      const reader = TestReader.instances[0];
      if (kind === "event") reader.fail();
      if (kind === "invalid-result") reader.load("unexpected-string");
      await expect(reading).rejects.toThrow(
        "This local file could not be read.",
      );
      await expect(reading).rejects.not.toThrow(
        /private-material|blob:|private\.invalid/u,
      );
      if (reader) {
        cleared(reader);
        expect(remove).toHaveBeenCalledWith("pagehide", expect.any(Function));
      }
    },
  );

  it("falls back to a real Blob in Node without pretending to cancel native work", async () => {
    vi.stubGlobal("FileReader", undefined);
    const bytes = new Uint8Array([0, 1, 255, 128]);
    expect(new Uint8Array(await readLocalBlobBytes(new Blob([bytes])))).toEqual(
      bytes,
    );
  });

  it("checks cancellation after an in-progress fallback read and sanitizes fallback failures", async () => {
    vi.stubGlobal("FileReader", undefined);
    const controller = new AbortController();
    let complete!: (value: ArrayBuffer) => void;
    const blob = new Blob([]);
    vi.spyOn(blob, "arrayBuffer").mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const reading = readLocalBlobBytes(blob, { signal: controller.signal });
    controller.abort();
    complete(new ArrayBuffer(1));
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    vi.spyOn(blob, "arrayBuffer").mockRejectedValue(
      new Error("blob:private-material"),
    );
    await expect(readLocalBlobBytes(blob)).rejects.toThrow(
      "This local file could not be read.",
    );
    await expect(readLocalBlobBytes(blob)).rejects.not.toThrow(
      "private-material",
    );
  });
});
