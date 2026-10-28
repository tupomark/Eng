export class RequestRejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function safeReturnPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
  )
    return "/account";
  const parsed = new URL(value, "https://lexis.invalid");
  if (parsed.origin !== "https://lexis.invalid") return "/account";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function assertSameOrigin(
  request: Request,
  configuredOrigin?: string,
): string {
  const expected = resolveRequestOrigin(request, configuredOrigin);
  const supplied = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    !supplied ||
    supplied !== expected ||
    (fetchSite && !["same-origin", "none"].includes(fetchSite))
  ) {
    throw new RequestRejectedError(
      "Open this action from LEXIS and try again.",
      403,
    );
  }
  return expected;
}

/**
 * Next's internal request URL can contain its bind address (0.0.0.0), while
 * Host remains the address/port used by the browser. Do not trust forwarded
 * host/proto supplied by an arbitrary client. A deployed reverse proxy that
 * rewrites Host must configure LEXIS_APP_ORIGIN explicitly.
 */
export function resolveRequestOrigin(
  request: Request,
  configuredOrigin?: string,
): string {
  if (configuredOrigin) {
    try {
      const parsed = new URL(configuredOrigin);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      )
        throw new Error("Invalid site origin");
      return parsed.origin;
    } catch {
      throw new RequestRejectedError(
        "The site address needs operator configuration. Local learning remains available.",
        503,
      );
    }
  }
  const internal = new URL(request.url);
  const host = request.headers.get("host");
  if (!host) return internal.origin;
  if (
    !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(host) ||
    !["http:", "https:"].includes(internal.protocol)
  )
    throw new RequestRejectedError("This site address is not supported.", 400);
  try {
    return new URL(`${internal.protocol}//${host}`).origin;
  } catch {
    throw new RequestRejectedError("This site address is not supported.", 400);
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new RequestRejectedError("This action requires JSON data.", 415);
  }
  const size = request.headers.get("content-length");
  if (size && Number(size) > maxBytes) {
    throw new RequestRejectedError("This action contains too much data.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestRejectedError("No action was provided.", 400);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestRejectedError(
          "This action contains too much data.",
          413,
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestRejectedError(
      "This action could not be read. Your existing data was not changed.",
      400,
    );
  }
}
