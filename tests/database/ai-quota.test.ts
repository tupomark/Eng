import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const alice = "11000000-0000-4000-8000-000000000001",
  bob = "11000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);
let db: PGlite;
async function service<T>(action: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return action(tx);
  });
}
async function reserve(
  user = alice,
  key = "request-1",
  cost = 10,
  userBudget: number | null = 100,
  serverBudget = 100,
  limit = 5,
  fingerprint = hash,
) {
  return service(
    async (tx) =>
      (
        await tx.query<{ result: Record<string, unknown> }>(
          "select public.reserve_ai_request_command($1,$2,$3,'tutor',$4,$5,$6,$7) as result",
          [user, key, fingerprint, cost, userBudget, serverBudget, limit],
        )
      ).rows[0]!.result,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable security invoker set search_path='' as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  const directory = resolve("supabase/migrations");
  for (const filename of readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(resolve(directory, filename), "utf8"));
  await db.query("insert into auth.users(id) values($1),($2)", [alice, bob]);
});
beforeEach(async () => {
  await db.exec("delete from lexis_private.ai_request_reservations");
});
afterAll(async () => {
  await db?.close();
});
describe("durable AI quota and delivery receipts (real PostgreSQL, not live Supabase)", () => {
  it("deletes only the owner's replies and seals in-flight reservations against late resurrection", async () => {
    await reserve(alice, "pending-alice");
    await reserve(bob, "completed-bob");
    await service((tx) =>
      tx.query("select public.complete_ai_request_command($1,$2,$3)", [
        bob,
        "completed-bob",
        { ok: true, value: { text: "Bob's reply" } },
      ]),
    );
    await service((tx) =>
      tx.query("select public.clear_ai_reply_cache_command($1)", [alice]),
    );
    expect(await reserve(alice, "pending-alice")).toEqual({
      status: "conflict",
    });
    await expect(
      service((tx) =>
        tx.query("select public.complete_ai_request_command($1,$2,$3)", [
          alice,
          "pending-alice",
          { ok: true, value: { text: "late private reply" } },
        ]),
      ),
    ).rejects.toThrow(/already completed/);
    expect(await reserve(bob, "completed-bob")).toMatchObject({
      status: "replay",
      result: { value: { text: "Bob's reply" } },
    });
    const row = (
      await db.query<{
        result: unknown;
        status: string;
        reserved_microusd: number;
      }>(
        "select result,status,reserved_microusd from lexis_private.ai_request_reservations where user_id=$1",
        [alice],
      )
    ).rows[0]!;
    expect(row.result).toBeNull();
    expect(row.status).toBe("completed");
    expect(Number(row.reserved_microusd)).toBe(10);
  });
  it("serializes reserve, in-flight retry, completion and cached delivery without duplicate charges", async () => {
    expect(await reserve()).toEqual({ status: "reserved" });
    expect(await reserve()).toEqual({ status: "in-progress" });
    const result = { ok: true, value: { text: "fixture reply" } };
    await service((tx) =>
      tx.query("select public.complete_ai_request_command($1,$2,$3)", [
        alice,
        "request-1",
        result,
      ]),
    );
    expect(await reserve()).toEqual({ status: "replay", result });
    expect(
      await reserve(alice, "request-1", 10, 100, 100, 5, "b".repeat(64)),
    ).toEqual({ status: "conflict" });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from lexis_private.ai_request_reservations",
        )
      ).rows[0]!.count,
    ).toBe(1);
  });
  it("enforces user and global caps across owners, including cancelled calls", async () => {
    expect(await reserve(alice, "first", 60)).toEqual({ status: "reserved" });
    await service((tx) =>
      tx.query("select public.complete_ai_request_command($1,$2,$3)", [
        alice,
        "first",
        { ok: false, code: "cancelled" },
      ]),
    );
    expect(await reserve(bob, "second", 60)).toEqual({
      status: "quota-exhausted",
    });
    expect(await reserve(bob, "second", 30)).toEqual({ status: "reserved" });
    expect(await reserve(bob, "third", 5, 100, 100, 1)).toEqual({
      status: "quota-exhausted",
    });
    await expect(reserve(alice, "null-budget", 1, null)).rejects.toThrow(
      /Invalid AI reservation/,
    );
  });
  it("denies anon and authenticated direct calls/table access, even with a forged owner ID", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query(
            "select public.reserve_ai_request_command($1,'forged',$2,'tutor',1,100,100,5)",
            [bob, hash],
          );
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query("select * from lexis_private.ai_request_reservations");
        }),
      ).rejects.toThrow(/permission denied/);
    }
  });
  it("expires/purges generated replies while keeping idempotency and quota tombstones", async () => {
    await reserve();
    await service((tx) =>
      tx.query("select public.complete_ai_request_command($1,$2,$3)", [
        alice,
        "request-1",
        { ok: true, value: { text: "a private answer" } },
      ]),
    );
    await db.exec(
      "update lexis_private.ai_request_reservations set result_expires_at=now()-interval '1 minute'",
    );
    await service((tx) =>
      tx.query("select lexis_private.expire_ai_reply_cache()"),
    );
    expect(await reserve()).toEqual({ status: "conflict" });
    const receipt = (
      await db.query<{ result: unknown; reserved_microusd: number }>(
        "select result,reserved_microusd from lexis_private.ai_request_reservations",
      )
    ).rows[0]!;
    expect(receipt.result).toBeNull();
    expect(Number(receipt.reserved_microusd)).toBe(10);
  });
});
