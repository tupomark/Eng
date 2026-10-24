import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SupabaseCommandRepository } from "@/infrastructure/supabase/command-repository";
import { mapLegacyId } from "@/infrastructure/supabase/legacy-id";
import { readSupabasePublicConfiguration } from "@/infrastructure/supabase/configuration";

const alice = "11000000-0000-4000-8000-000000000001";
const evidence = "31000000-0000-4000-8000-000000000001";

function adapter(
  payload: unknown,
  status = 200,
  capture?: (url: string, body: Record<string, unknown>) => void,
) {
  const client = createClient(
    "https://contract-fixture.supabase.test",
    "sb_secret_contract_fixture_not_a_credential",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input, options) => {
          capture?.(String(input), JSON.parse(String(options?.body)));
          return new Response(JSON.stringify(payload), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    },
  );
  return new SupabaseCommandRepository(client);
}

describe("actual Supabase SDK command adapter contract fixtures", () => {
  it("sends a small atomic command to the real SDK RPC path with the verified actor", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const repository = adapter(
      { evidenceId: evidence, revision: 1, projectionInvalidated: true },
      200,
      (url, body) => {
        captured = { url, body };
      },
    );
    const result = await repository.execute(
      { userId: alice },
      {
        type: "self-review",
        key: "retry-key",
        eventId: evidence,
        senseId: "linger-stay",
        occurredAt: "2026-01-01T10:00:00.000Z",
        rating: "good",
        expectedRevision: 0,
      },
    );
    expect(result.projectionInvalidated).toBe(true);
    expect(captured).toEqual({
      url: "https://contract-fixture.supabase.test/rest/v1/rpc/record_self_review_command",
      body: {
        p_user_id: alice,
        p_key: "retry-key",
        p_sense_id: "linger-stay",
        p_event_id: evidence,
        p_rating: "good",
        p_occurred_at: "2026-01-01T10:00:00.000Z",
        p_expected_revision: 0,
      },
    });
  });

  it("returns a recoverable conflict without exposing internal SQL/private details", async () => {
    const repository = adapter(
      {
        code: "40001",
        message: "internal table path and private writing must not escape",
        details: "private fixture",
      },
      409,
    );
    const result = repository.execute(
      { userId: alice },
      {
        type: "archive-sense",
        key: "archive-key",
        senseId: "linger-stay",
        expectedRevision: 0,
      },
    );
    await expect(result).rejects.toMatchObject({ status: 409 });
    await expect(result).rejects.not.toThrow(/internal table|private fixture/);
  });

  it("rejects an incomplete or mismatched successful JSON response", async () => {
    for (const result of [null, [], "accepted", {}, { senseId: "wrong" }]) {
      await expect(
        adapter(result).execute(
          { userId: alice },
          {
            type: "archive-sense",
            key: "archive-key",
            senseId: "linger-stay",
            expectedRevision: 0,
          },
        ),
      ).rejects.toMatchObject({ status: 503 });
    }
  });

  it("maps a server-side writing conflict without discarding its saved revision", async () => {
    const revisionId = "32000000-0000-4000-8000-000000000001";
    expect(
      await adapter({
        revisionId,
        conflict: true,
        currentRevisionId: "32000000-0000-4000-8000-000000000002",
      }).execute(
        { userId: alice },
        {
          type: "append-writing-revision",
          key: "writing-key",
          draftId: "22000000-0000-4000-8000-000000000001",
          revisionId,
          parentRevisionId: null,
          body: "A preserved conflicting revision.",
        },
      ),
    ).toMatchObject({ conflict: true, revisionId });
  });

  it("persists a stable namespaced legacy UUID rather than generating one per retry", async () => {
    const mapped = mapLegacyId(alice, "evidence", "legacy:event-1");
    let captured: Record<string, unknown> | null = null;
    expect(
      await adapter(mapped, 200, (_url, body) => {
        captured = body;
      }).persistLegacyMapping({ userId: alice }, "evidence", "legacy:event-1"),
    ).toBe(mapped);
    expect(captured).toEqual({
      p_user_id: alice,
      p_namespace: "evidence",
      p_legacy_id: "legacy:event-1",
      p_mapped_id: mapped,
    });
    await expect(
      adapter("different-id").persistLegacyMapping(
        { userId: alice },
        "evidence",
        "legacy:event-1",
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("Supabase configuration boundary", () => {
  it("distinguishes missing or unsafe configuration from valid configured settings without claiming availability", () => {
    for (const url of [
      undefined,
      "javascript:alert(1)",
      "http://public-host.example",
      "https://user:password@fixture.example",
      "https://fixture.example/path",
    ]) {
      expect(
        readSupabasePublicConfiguration({
          NEXT_PUBLIC_SUPABASE_URL: url,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-key",
        }),
      ).toBeNull();
    }
    expect(
      readSupabasePublicConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-key",
      }),
    ).toMatchObject({ url: "http://127.0.0.1:54321" });
  });
});
