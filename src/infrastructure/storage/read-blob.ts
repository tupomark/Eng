function cancelled(): DOMException {
  return new DOMException(
    "The local file read was cancelled. Saved source data is unchanged.",
    "AbortError",
  );
}

function unreadable(): Error {
  return new Error(
    "This local file could not be read. Its saved source data is unchanged.",
  );
}

function check(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled();
}

/**
 * FileReader permits native cancellation before a document leaves. In particular,
 * WebKit must not keep Blob.arrayBuffer()'s temporary URL read alive across navigation.
 * The non-browser fallback can only check cancellation before and after its read.
 */
export async function readLocalBlobBytes(
  blob: Blob,
  options: { signal?: AbortSignal } = {},
): Promise<ArrayBuffer> {
  const { signal } = options;
  check(signal);
  if (typeof FileReader === "undefined") {
    try {
      const result = await blob.arrayBuffer();
      check(signal);
      return result;
    } catch {
      check(signal);
      throw unreadable();
    }
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    let reader: FileReader;
    try {
      reader = new FileReader();
    } catch {
      reject(unreadable());
      return;
    }
    let settled = false;
    const page = typeof window === "undefined" ? undefined : window;
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      page?.removeEventListener("pagehide", abort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
    };
    const finish = (result: ArrayBuffer | Error | DOMException) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(result);
    };
    const abort = () => {
      if (settled) return;
      try {
        reader.abort();
      } catch {
        // A completed/detached reader has no further result to accept.
      }
      finish(cancelled());
    };
    reader.onload = () => {
      if (signal?.aborted) {
        abort();
        return;
      }
      finish(
        reader.result instanceof ArrayBuffer ? reader.result : unreadable(),
      );
    };
    reader.onerror = () => finish(unreadable());
    reader.onabort = () => finish(cancelled());
    signal?.addEventListener("abort", abort, { once: true });
    page?.addEventListener("pagehide", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      reader.readAsArrayBuffer(blob);
    } catch {
      finish(unreadable());
    }
  });
}
