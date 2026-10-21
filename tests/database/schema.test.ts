import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";
const aliceDoc = "20000000-0000-4000-8000-000000000001";
const bobDoc = "20000000-0000-4000-8000-000000000002";
const aliceEvidence = "30000000-0000-4000-8000-000000000001";
const bobEvidence = "30000000-0000-4000-8000-000000000002";
let db: PGlite;

async function asUser<T>(
  userId: string,
  callback: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);
    return callback(tx);
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable security invoker
      set search_path = ''
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
  for (const filename of readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(resolve(migrationDirectory, filename), "utf8"));
  }
  await db.exec(`
    insert into auth.users values ('${alice}'), ('${bob}');
    insert into public.lexemes (id,lemma,part_of_speech,source,source_version)
      values ('linger','linger','verb','LEXIS original','1');
    insert into public.senses (id,lexeme_id,definition,translation_ru,example,source_sense_key)
      values ('linger-stay','linger','To stay for longer.','задерживаться','We linger by the gate.','stay'),
             ('linger-remain','linger','To remain perceptible.','сохраняться','A scent lingers.','remain');
    insert into public.library_documents (id,user_id,title,source_kind)
      values ('${aliceDoc}','${alice}','Alice private metadata','import'),
             ('${bobDoc}','${bob}','Bob private metadata','import');
    insert into public.reader_positions (user_id,document_id,character_offset)
      values ('${alice}','${aliceDoc}',30), ('${bob}','${bobDoc}',90);
    insert into public.user_saved_senses (user_id,sense_id,context,source_document_id)
      values ('${alice}','linger-stay','Alice context','${aliceDoc}'),
             ('${bob}','linger-stay','Bob context','${bobDoc}');
    insert into public.learning_evidence
      (id,user_id,sense_id,skill,source,source_version,rubric_version,rating,idempotency_key)
      values ('${aliceEvidence}','${alice}','linger-stay','recognition','self-review','self-review-v1','self-review-v1','good','${aliceEvidence}'),
             ('${bobEvidence}','${bob}','linger-stay','recognition','self-review','self-review-v1','self-review-v1','hard','${bobEvidence}');
    insert into public.evidence_disputes (user_id,evidence_id,reason)
      values ('${bob}','${bobEvidence}','Bob private dispute');
    insert into public.skill_progress
      (user_id,sense_id,skill,score,attempts,due_at,interval_days,algorithm_version,evidence_count)
      values ('${alice}','linger-stay','recognition',0.4,1,now(),1,'heuristic-v1',1),
             ('${bob}','linger-stay','recognition',0.2,1,now(),1,'heuristic-v1',1);
  `);
});

afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL migration and access boundaries", () => {
  it("enables RLS for every public table", async () => {
    const result = await db.query<{
      relname: string;
      relrowsecurity: boolean;
    }>(`
      select c.relname,c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `);
    expect(result.rows).toHaveLength(8);
    expect(result.rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("allows catalog reads while isolating all user-owned tables", async () => {
    await asUser(alice, async (tx) => {
      expect((await tx.query("select * from public.senses")).rows).toHaveLength(
        2,
      );
      for (const table of [
        "library_documents",
        "reader_positions",
        "user_saved_senses",
        "learning_evidence",
        "skill_progress",
      ]) {
        const rows = (
          await tx.query<{ user_id: string }>(
            `select user_id from public.${table}`,
          )
        ).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]?.user_id).toBe(alice);
      }
      expect(
        (await tx.query("select * from public.evidence_disputes")).rows,
      ).toHaveLength(0);
    });
  });

  it("rejects unauthenticated access", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        return tx.query("select * from public.user_saved_senses");
      }),
    ).rejects.toThrow(/permission denied/i);
    expect(
      await asUser(
        "",
        async (tx) =>
          (await tx.query("select * from public.user_saved_senses")).rows,
      ),
    ).toEqual([]);
  });

  it("does not produce skill estimates merely from saving a distinct meaning", async () => {
    await asUser(alice, async (tx) => {
      await tx.query(
        "insert into public.user_saved_senses (user_id,sense_id) values ($1,$2)",
        [alice, "linger-remain"],
      );
      expect(
        (
          await tx.query(
            "select * from public.skill_progress where sense_id = 'linger-remain'",
          )
        ).rows,
      ).toHaveLength(0);
      await tx.query(
        "delete from public.user_saved_senses where sense_id = 'linger-remain'",
      );
    });
  });

  it("rejects saved meaning duplicates and cross-user document references", async () => {
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.user_saved_senses (user_id,sense_id) values ($1,$2)",
          [alice, "linger-stay"],
        ),
      ),
    ).rejects.toThrow(/unique constraint/i);
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.user_saved_senses (user_id,sense_id,source_document_id) values ($1,$2,$3)",
          [alice, "linger-remain", bobDoc],
        ),
      ),
    ).rejects.toThrow(/foreign key constraint/i);
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.reader_positions (user_id,document_id) values ($1,$2)",
          [alice, bobDoc],
        ),
      ),
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it("prevents ownership reassignment and forged ownership inserts", async () => {
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "update public.library_documents set user_id = $1 where id = $2",
          [bob, aliceDoc],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.library_documents (user_id,title,source_kind) values ($1,'Forged','import')",
          [bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("permits owned self-review observations and uses user-scoped retry keys", async () => {
    const key = "40000000-0000-4000-8000-000000000001";
    await asUser(alice, async (tx) => {
      const insert = `insert into public.learning_evidence
        (user_id,sense_id,skill,source,source_version,rubric_version,rating,idempotency_key)
        values ($1,'linger-stay','recognition','self-review','self-review-v1','self-review-v1','good',$2)
        on conflict (user_id,idempotency_key) do nothing`;
      await tx.query(insert, [alice, key]);
      await tx.query(insert, [alice, key]);
      const count = await tx.query<{ count: number }>(
        "select count(*)::integer as count from public.learning_evidence where idempotency_key = $1",
        [key],
      );
      expect(count.rows[0]?.count).toBe(1);
      // Test is rolled forward; remove its parent at administrator scope below.
    });
    await db.query(
      "delete from public.learning_evidence where idempotency_key = $1",
      [key],
    );
  });

  it("does not allow a browser to forge AI evidence or scored self-review", async () => {
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          `insert into public.learning_evidence
      (user_id,sense_id,skill,source,source_version,rubric_version,score,assessor_provider,assessor_model,idempotency_key)
      values ($1,'linger-stay','writing','ai-verification','1','1',1,'forged','forged',gen_random_uuid())`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          `insert into public.learning_evidence
      (user_id,sense_id,skill,source,source_version,rubric_version,rating,score,idempotency_key)
      values ($1,'linger-stay','recognition','self-review','self-review-v1','self-review-v1','easy',1,gen_random_uuid())`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("keeps evidence immutable and derived estimates read-only for browser roles", async () => {
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "update public.learning_evidence set rating = 'easy' where id = $1",
          [aliceEvidence],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(alice, (tx) =>
        tx.query("delete from public.learning_evidence where id = $1", [
          aliceEvidence,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(alice, (tx) =>
        tx.query("update public.skill_progress set score = 1"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(alice, (tx) =>
        tx.query("update public.senses set definition = 'Forged'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("allows disputes only for an owned observation and keeps the original evidence", async () => {
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.evidence_disputes (user_id,evidence_id) values ($1,$2)",
          [alice, bobEvidence],
        ),
      ),
    ).rejects.toThrow(/foreign key constraint/i);
    await asUser(alice, async (tx) => {
      await tx.query(
        "insert into public.evidence_disputes (user_id,evidence_id,reason) values ($1,$2,$3)",
        [alice, aliceEvidence, "Exclude this self-assessment."],
      );
      expect(
        (await tx.query("select * from public.evidence_disputes")).rows,
      ).toHaveLength(1);
      expect(
        (
          await tx.query(
            "select * from public.learning_evidence where id = $1",
            [aliceEvidence],
          )
        ).rows,
      ).toHaveLength(1);
    });
  });
});
