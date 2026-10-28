import { describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  executeAuthenticatedCommand,
  parseLearningCommand,
} from "@/application/server/learning-command";
import {
  assertSameOrigin,
  readBoundedJson,
  resolveRequestOrigin,
  safeReturnPath,
} from "@/infrastructure/supabase/request-guards";
import { mapLegacyId, uuidV5 } from "@/infrastructure/supabase/legacy-id";

const alice = "11000000-0000-4000-8000-000000000001";
const bob = "11000000-0000-4000-8000-000000000002";
const review = {
  type: "self-review",
  key: "delivery-1",
  senseId: "linger-stay",
  eventId: "31000000-0000-4000-8000-000000000001",
  rating: "good",
  occurredAt: "2026-01-01T10:00:00.000Z",
  expectedRevision: 0,
};

describe("server command identity and safety boundaries", () => {
  it("rejects a client-supplied owner, score, provider and full-profile snapshot", () => {
    for (const extra of [
      { userId: bob },
      { user_id: bob },
      { score: 1 },
      { provider: "forged" },
      { state: { version: 1, evidence: [] } },
    ]) {
      expect(() => parseLearningCommand({ ...review, ...extra })).toThrow(
        /unsupported data/i,
      );
    }
  });

  it("passes only the verified request-scoped identity to the trusted command port", async () => {
    const execute = vi.fn().mockResolvedValue({ evidenceId: review.eventId });
    const result = await executeAuthenticatedCommand(
      review,
      async () => ({ userId: alice }),
      { execute },
    );
    expect(result).toEqual({ evidenceId: review.eventId });
    expect(execute).toHaveBeenCalledWith({ userId: alice }, review, undefined);
  });

  it("does not issue a command for an expired identity or cancelled request", async () => {
    const execute = vi.fn();
    await expect(
      executeAuthenticatedCommand(review, async () => null, { execute }),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    const controller = new AbortController();
    controller.abort();
    await expect(
      executeAuthenticatedCommand(
        review,
        async () => ({ userId: alice }),
        { execute },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("validates time, UUID, revision and deletion confirmation before any mutation", () => {
    for (const input of [
      { ...review, occurredAt: "tomorrow" },
      { ...review, eventId: "legacy-not-yet-mapped" },
      { ...review, expectedRevision: null },
      { ...review, expectedRevision: -1 },
      { ...review, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      {
        type: "purge-sense",
        key: "purge-1",
        senseId: "linger-stay",
        confirmation: "yes",
      },
    ]) {
      expect(() => parseLearningCommand(input)).toThrow();
    }
    expect(parseLearningCommand(review)).toEqual(review);
  });
});

describe("Auth request and callback guards", () => {
  it("allows a same-origin POST and refuses missing/foreign origins or cross-site metadata", () => {
    const request = (headers: Record<string, string>) =>
      new Request("https://lexis.example/api/account", {
        method: "POST",
        headers,
      });
    expect(assertSameOrigin(request({ origin: "https://lexis.example" }))).toBe(
      "https://lexis.example",
    );
    const invalidHeaders: Record<string, string>[] = [
      {},
      { origin: "https://attacker.example" },
      { origin: "null" },
      { origin: "https://lexis.example", "sec-fetch-site": "cross-site" },
    ];
    for (const headers of invalidHeaders) {
      expect(() => assertSameOrigin(request(headers))).toThrow();
    }
  });

  it("pins a configured public origin instead of trusting another request host", () => {
    const request = new Request("https://wrong.example/api/account", {
      method: "POST",
      headers: { origin: "https://wrong.example" },
    });
    expect(() => assertSameOrigin(request, "https://lexis.example")).toThrow();
  });

  it("uses the browser Host/port when Next's internal URL contains a bind address", () => {
    const request = new Request("http://0.0.0.0:3000/api/learning/command", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "x-forwarded-host": "unrelated.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(resolveRequestOrigin(request)).toBe("http://127.0.0.1:3000");
    expect(assertSameOrigin(request)).toBe("http://127.0.0.1:3000");
    const forged = new Request("http://0.0.0.0:3000/api/account", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "https://unrelated.example",
        "x-forwarded-host": "unrelated.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(() => assertSameOrigin(forged)).toThrow();
  });

  it("builds a callback base from the browser port and gives explicit configuration priority", () => {
    const callback = new Request(
      "http://0.0.0.0:3000/auth/callback?next=https://unrelated.example",
      {
        headers: { host: "localhost:3000" },
      },
    );
    expect(
      new URL(
        safeReturnPath("https://unrelated.example"),
        resolveRequestOrigin(callback),
      ).href,
    ).toBe("http://localhost:3000/account");
    expect(resolveRequestOrigin(callback, "https://lexis.example")).toBe(
      "https://lexis.example",
    );
    for (const host of [
      "user@unrelated.example",
      "lexis.example/other",
      "lexis.example:99999",
    ]) {
      expect(() =>
        resolveRequestOrigin(
          new Request("http://0.0.0.0:3000/account", { headers: { host } }),
        ),
      ).toThrow();
    }
  });

  it("keeps return paths local, including encoded slash, backslash and control-char attacks", () => {
    for (const value of [
      null,
      "https://attacker.example",
      "//attacker.example",
      "/\\attacker.example",
      "/%2f%2fattacker.example",
      "/%5cattacker.example",
      "/account\r\nLocation: https://attacker.example",
      "/account%0d%0aLocation:evil",
    ]) {
      expect(safeReturnPath(value)).toBe("/account");
    }
    expect(safeReturnPath("/reader?document=private#paragraph-2")).toBe(
      "/reader?document=private#paragraph-2",
    );
  });

  it("enforces byte limits while consuming an untrusted stream, without relying on Content-Length", async () => {
    const request = new Request("https://lexis.example/api/account", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "я".repeat(50) }),
    });
    await expect(readBoundedJson(request, 40)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("preserves a valid JSON object and rejects malformed/incorrectly typed data", async () => {
    const request = (body: string, contentType = "application/json") =>
      new Request("https://lexis.example/api/account", {
        method: "POST",
        headers: { "content-type": contentType },
        body,
      });
    expect(
      await readBoundedJson(request('{"action":"sign-out"}'), 100),
    ).toEqual({ action: "sign-out" });
    await expect(readBoundedJson(request("{"), 100)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readBoundedJson(request("{}", "text/plain"), 100),
    ).rejects.toMatchObject({ status: 415 });
  });
});

describe("stable migration identity", () => {
  it("matches the standard UUIDv5 DNS test vector", () => {
    expect(
      uuidV5("6ba7b810-9dad-11d1-80b4-00c04fd430c8", "www.widgets.com"),
    ).toBe("21f7f8de-8051-5b89-8680-0195ef798b6a");
  });

  it("maps arbitrary legacy IDs deterministically with explicit owner and entity namespaces", () => {
    const first = mapLegacyId(alice, "evidence", "event:legacy-1");
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(mapLegacyId(alice, "evidence", "event:legacy-1")).toBe(first);
    expect(mapLegacyId(bob, "evidence", "event:legacy-1")).not.toBe(first);
    expect(mapLegacyId(alice, "documents", "event:legacy-1")).not.toBe(first);
    expect(mapLegacyId(alice, "evidence", "event:legacy-2")).not.toBe(first);
  });
});
