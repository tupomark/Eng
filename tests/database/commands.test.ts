import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const alice = "11000000-0000-4000-8000-000000000001";
const bob = "11000000-0000-4000-8000-000000000002";
const transient = "11000000-0000-4000-8000-000000000003";
const aliceDoc = "21000000-0000-4000-8000-000000000001";
const bobDoc = "21000000-0000-4000-8000-000000000002";
const aliceDraft = "22000000-0000-4000-8000-000000000001";
const bobDraft = "22000000-0000-4000-8000-000000000002";
const eventId = (number: number) =>
  `31000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const revisionId = (number: number) =>
  `32000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
let db: PGlite;

async function withRole<T>(
  role: "authenticated" | "anon" | "service_role",
  userId: string | null,
  action: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      userId ?? "",
    ]);
    return action(tx);
  });
}

async function command(name: string, values: unknown[]) {
  return withRole("service_role", null, async (tx) => {
    const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
    const result = await tx.query<{ result: Record<string, unknown> }>(
      `select public.${name}(${placeholders}) as result`,
      values,
    );
    return result.rows[0]!.result;
  });
}

async function insertEvidence(userId: string, sense: string, id: number) {
  await db.query(
    `insert into public.learning_evidence
      (id,user_id,sense_id,skill,source,source_version,rubric_version,rating,idempotency_key)
      values($1,$2,$3,'recognition','self-review','self-review-v1','self-review-v1','good',$1)`,
    [eventId(id), userId, sense],
  );
}

async function insertProjection(userId: string, sense: string, count = 1) {
  await db.query(
    `insert into public.skill_progress
      (user_id,sense_id,skill,score,attempts,due_at,interval_days,algorithm_version,evidence_count)
      values($1,$2,'recognition',0.5,$3,now(),1,'heuristic-v1',$3)`,
    [userId, sense, count],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable security invoker
      set search_path='' as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  const directory = resolve("supabase/migrations");
  for (const filename of readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(resolve(directory, filename), "utf8"));
  }
  await db.query("insert into auth.users(id) values($1),($2),($3)", [
    alice,
    bob,
    transient,
  ]);
  await db.exec(`
    insert into public.lexemes(id,lemma,part_of_speech,source,source_version)
      values('fixture','fixture','noun','LEXIS test fixture','1');
    insert into public.senses(id,lexeme_id,definition,translation_ru,example,source_sense_key)
      select name,'fixture','An authored test meaning.','Тестовое значение','A fixture.',name
      from unnest(array['archive','empty','review','dispute','freshness','purge','account']) as name;
  `);
  await db.query(
    `insert into public.user_saved_senses(user_id,sense_id)
      select $1,id from public.senses`,
    [alice],
  );
  await db.query(
    `insert into public.user_saved_senses(user_id,sense_id) values($1,'archive'),($1,'purge'),($2,'account')`,
    [bob, transient],
  );
  await db.query(
    `insert into public.library_documents(id,user_id,title,source_kind)
      values($1,$2,'Alice private book','import'),($3,$4,'Bob private book','import')`,
    [aliceDoc, alice, bobDoc, bob],
  );
  await db.query(
    `insert into public.writing_drafts(id,user_id,title)
      values($1,$2,'Alice draft'),($3,$4,'Bob draft')`,
    [aliceDraft, alice, bobDraft, bob],
  );
});

afterAll(async () => {
  await db?.close();
});

describe("atomic server commands and archive safety", () => {
  it("archives a saved meaning without losing evidence or disputes; retry returns the same receipt", async () => {
    await insertEvidence(alice, "archive", 1);
    await db.query(
      "insert into public.evidence_disputes(user_id,evidence_id,reason) values($1,$2,'Keep the audit')",
      [alice, eventId(1)],
    );
    await insertProjection(alice, "archive");
    const first = await command("archive_saved_sense_command", [
      alice,
      "archive",
      "archive-key",
      0,
    ]);
    expect(first).toMatchObject({ archived: true, revision: 1 });
    expect(
      await command("archive_saved_sense_command", [
        alice,
        "archive",
        "archive-key",
        0,
      ]),
    ).toEqual(first);
    expect(
      (
        await db.query(
          "select id from public.learning_evidence where user_id=$1 and sense_id='archive'",
          [alice],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from public.evidence_disputes where user_id=$1 and evidence_id=$2",
          [alice, eventId(1)],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("refuses ordinary deletion of practised history while allowing a never-practised save to be undone", async () => {
    await expect(
      withRole("authenticated", alice, (tx) =>
        tx.query(
          "delete from public.user_saved_senses where user_id=$1 and sense_id='archive'",
          [alice],
        ),
      ),
    ).rejects.toThrow(/foreign key constraint/i);
    await withRole("authenticated", alice, (tx) =>
      tx.query(
        "delete from public.user_saved_senses where user_id=$1 and sense_id='empty'",
        [alice],
      ),
    );
    expect(
      (
        await db.query(
          "select * from public.user_saved_senses where user_id=$1 and sense_id='archive'",
          [alice],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("requires explicit purge confirmation and removes only the selected owner's history", async () => {
    await insertEvidence(alice, "purge", 2);
    await insertEvidence(bob, "purge", 3);
    await insertProjection(alice, "purge");
    await expect(
      command("purge_saved_sense_command", [
        alice,
        "purge",
        "purge-key",
        "yes",
      ]),
    ).rejects.toThrow(/confirmation required/i);
    const result = await command("purge_saved_sense_command", [
      alice,
      "purge",
      "purge-key",
      "DELETE HISTORY: purge",
    ]);
    expect(result).toMatchObject({ purged: true, removedEvidenceCount: 1 });
    expect(
      await command("purge_saved_sense_command", [
        alice,
        "purge",
        "purge-key",
        "DELETE HISTORY: purge",
      ]),
    ).toEqual(result);
    const remaining = await db.query<{ user_id: string }>(
      "select user_id from public.learning_evidence where sense_id='purge'",
    );
    expect(remaining.rows).toEqual([{ user_id: bob }]);
  });

  it("retains separately authorised account deletion despite protected saved-meaning foreign keys", async () => {
    await insertEvidence(transient, "account", 4);
    await insertProjection(transient, "account");
    await db.query("delete from auth.users where id=$1", [transient]);
    for (const table of [
      "user_saved_senses",
      "learning_evidence",
      "skill_progress",
    ]) {
      expect(
        (
          await db.query(`select * from public.${table} where user_id=$1`, [
            transient,
          ])
        ).rows,
      ).toHaveLength(0);
    }
  });

  it("records one self-reported recognition event, invalidates projection and detects a conflicting retry", async () => {
    await insertProjection(alice, "review");
    const input = [
      alice,
      "review",
      eventId(5),
      "review-key",
      "good",
      "2026-01-01T10:00:00Z",
      0,
    ];
    const first = await command("record_self_review_command", input);
    expect(await command("record_self_review_command", input)).toEqual(first);
    expect(first).toMatchObject({
      revision: 1,
      projectionInvalidated: true,
    });
    await expect(
      command("record_self_review_command", [
        ...input.slice(0, 4),
        "easy",
        ...input.slice(5),
      ]),
    ).rejects.toThrow(/key already used/i);
    const rows = await db.query<{
      skill: string;
      score: number | null;
      independence: string;
    }>(
      "select skill,score,independence from public.learning_evidence where user_id=$1 and sense_id='review'",
      [alice],
    );
    expect(rows.rows).toEqual([
      { skill: "recognition", score: null, independence: "unknown" },
    ]);
    expect(
      (
        await db.query(
          "select * from public.skill_progress where user_id=$1 and sense_id='review'",
          [alice],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("rejects stale revision and invalid/future clocks without leaving evidence or a successful receipt", async () => {
    await expect(
      command("record_self_review_command", [
        alice,
        "review",
        eventId(6),
        "stale-key",
        "good",
        "2026-01-02T10:00:00Z",
        0,
      ]),
    ).rejects.toThrow(/changed; reload/i);
    for (const time of ["1969-01-01T00:00:00Z", "2100-01-01T00:00:00Z"]) {
      await expect(
        command("record_self_review_command", [
          alice,
          "review",
          eventId(6),
          "clock-key",
          "good",
          time,
          1,
        ]),
      ).rejects.toThrow(/Invalid review time/i);
    }
    expect(
      (
        await db.query(
          "select * from lexis_private.command_receipts where command_key in ('stale-key','clock-key')",
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("excludes an earlier event after later reviews without deleting canonical history or serving its projection", async () => {
    for (const id of [7, 8, 9]) await insertEvidence(alice, "dispute", id);
    await insertProjection(alice, "dispute", 3);
    const result = await command("dispute_evidence_command", [
      alice,
      eventId(7),
      "dispute-key",
      "An ambiguous prompt.",
    ]);
    expect(result).toMatchObject({
      excluded: true,
      projectionInvalidated: true,
    });
    expect(
      await command("dispute_evidence_command", [
        alice,
        eventId(7),
        "dispute-key",
        "An ambiguous prompt.",
      ]),
    ).toEqual(result);
    expect(
      (
        await db.query(
          "select id from public.learning_evidence where user_id=$1 and sense_id='dispute'",
          [alice],
        )
      ).rows,
    ).toHaveLength(3);
    const active = await db.query(
      `select e.id from public.learning_evidence e where e.user_id=$1 and e.sense_id='dispute'
       and not exists(select 1 from public.evidence_disputes d where d.user_id=e.user_id and d.evidence_id=e.id)`,
      [alice],
    );
    expect(active.rows).toHaveLength(2);
    expect(
      (
        await db.query(
          "select * from public.skill_progress where user_id=$1 and sense_id='dispute'",
          [alice],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("hides stale projection even when a legacy direct dispute backdates its public timestamp", async () => {
    await insertEvidence(alice, "freshness", 10);
    await insertProjection(alice, "freshness");
    expect(
      await withRole(
        "authenticated",
        alice,
        async (tx) =>
          (
            await tx.query(
              "select * from public.skill_progress where sense_id='freshness'",
            )
          ).rows,
      ),
    ).toHaveLength(1);
    await withRole("authenticated", alice, (tx) =>
      tx.query(
        `insert into public.evidence_disputes(user_id,evidence_id,reason,created_at,recorded_at)
          values($1,$2,'Excluded','2000-01-01','2000-01-01')`,
        [alice, eventId(10)],
      ),
    );
    expect(
      await withRole(
        "authenticated",
        alice,
        async (tx) =>
          (
            await tx.query(
              "select * from public.skill_progress where sense_id='freshness'",
            )
          ).rows,
      ),
    ).toHaveLength(0);
  });

  it("stores both branches of a concurrent writing edit and keeps the accepted head", async () => {
    await command("append_writing_revision_command", [
      alice,
      aliceDraft,
      revisionId(1),
      null,
      "Original draft — café.",
      "writing-1",
    ]);
    await command("append_writing_revision_command", [
      alice,
      aliceDraft,
      revisionId(2),
      revisionId(1),
      "Tab A revision.",
      "writing-2",
    ]);
    const conflictInput = [
      alice,
      aliceDraft,
      revisionId(3),
      revisionId(1),
      "Tab B revision, independently preserved.",
      "writing-3",
    ];
    const conflict = await command(
      "append_writing_revision_command",
      conflictInput,
    );
    expect(conflict).toMatchObject({
      conflict: true,
      revisionId: revisionId(3),
      currentRevisionId: revisionId(2),
    });
    expect(
      await command("append_writing_revision_command", conflictInput),
    ).toEqual(conflict);
    const revisions = await withRole("authenticated", alice, (tx) =>
      tx.query<{ body: string }>(
        "select body from public.writing_revisions order by created_at,id",
      ),
    );
    expect(revisions.rows.map((row) => row.body)).toEqual([
      "Original draft — café.",
      "Tab A revision.",
      "Tab B revision, independently preserved.",
    ]);
  });

  it("blocks foreign ownership, foreign revision parents and client mutation of trusted heads", async () => {
    await expect(
      command("append_writing_revision_command", [
        alice,
        bobDraft,
        revisionId(4),
        null,
        "Not mine.",
        "writing-foreign",
      ]),
    ).rejects.toThrow(/Draft not found/i);
    await command("append_writing_revision_command", [
      bob,
      bobDraft,
      revisionId(5),
      null,
      "Bob private writing.",
      "bob-writing",
    ]);
    await expect(
      command("append_writing_revision_command", [
        alice,
        aliceDraft,
        revisionId(6),
        revisionId(5),
        "Cannot attach a foreign revision.",
        "writing-foreign-parent",
      ]),
    ).rejects.toThrow(/foreign key constraint/i);
    await expect(
      withRole("authenticated", alice, (tx) =>
        tx.query("update public.writing_drafts set current_revision_id=$1", [
          revisionId(3),
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    const visible = await withRole("authenticated", alice, (tx) =>
      tx.query<{ user_id: string }>(
        "select user_id from public.writing_revisions",
      ),
    );
    expect(visible.rows.every((row) => row.user_id === alice)).toBe(true);
  });

  it("blocks RPC access for browser/anon roles and keeps receipt/mapping tables private", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        withRole(role, alice, (tx) =>
          tx.query(
            "select public.archive_saved_sense_command($1,'review','forged-client',1)",
            [alice],
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        withRole(role, alice, (tx) =>
          tx.query("select * from lexis_private.command_receipts"),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
    const rows = await withRole("authenticated", "", (tx) =>
      tx.query("select * from public.writing_drafts"),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it("keeps additional source links and unresolved imports private and separate from knowledge", async () => {
    const aliceBatch = "41000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into public.import_batches(id,user_id,source_format) values($1,$2,'csv')",
      [aliceBatch, alice],
    );
    await db.query(
      "insert into public.import_rows(user_id,batch_id,ordinal,surface) values($1,$2,0,'trace')",
      [alice, aliceBatch],
    );
    await expect(
      db.query(
        "insert into public.import_rows(user_id,batch_id,ordinal,surface) values($1,$2,1,'foreign')",
        [bob, aliceBatch],
      ),
    ).rejects.toThrow(/foreign key constraint/i);
    await expect(
      db.query(
        "insert into public.saved_sense_contexts(user_id,sense_id,document_id,excerpt) values($1,'review',$2,'Foreign source')",
        [alice, bobDoc],
      ),
    ).rejects.toThrow(/foreign key constraint/i);
    const rows = await withRole("authenticated", alice, (tx) =>
      tx.query<{ candidate_sense_id: string | null; status: string }>(
        "select candidate_sense_id,status from public.import_rows",
      ),
    );
    expect(rows.rows).toEqual([
      { candidate_sense_id: null, status: "unresolved" },
    ]);
    expect(
      await withRole(
        "authenticated",
        bob,
        async (tx) => (await tx.query("select * from public.import_rows")).rows,
      ),
    ).toHaveLength(0);
  });

  it("does not permit null optimistic revisions to bypass serialization", async () => {
    await expect(
      command("archive_saved_sense_command", [
        alice,
        "review",
        "null-revision",
        null,
      ]),
    ).rejects.toThrow(/Expected revision required/i);
    await expect(
      command("record_self_review_command", [
        alice,
        "review",
        eventId(14),
        "null-review-revision",
        "good",
        "2026-01-01",
        null,
      ]),
    ).rejects.toThrow(/Expected revision required/i);
  });

  it("stores a legacy ID mapping once and rejects remapping rather than silently duplicating history", async () => {
    const mapped = "51000000-0000-5000-8000-000000000001";
    const call = (id: string) =>
      withRole("service_role", null, (tx) =>
        tx.query<{ mapped: string }>(
          "select public.map_legacy_id_command($1,'evidence','old:event-1',$2) as mapped",
          [alice, id],
        ),
      );
    expect((await call(mapped)).rows).toEqual([{ mapped }]);
    expect((await call(mapped)).rows).toEqual([{ mapped }]);
    await expect(call("51000000-0000-5000-8000-000000000002")).rejects.toThrow(
      /different mapping/i,
    );
    expect(
      (
        await db.query(
          "select * from lexis_private.legacy_id_map where user_id=$1",
          [alice],
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      withRole("authenticated", alice, (tx) =>
        tx.query(
          "select public.map_legacy_id_command($1,'evidence','forged',$2)",
          [alice, mapped],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("ties structural anchors to the actual document and chapter version, including document purge", async () => {
    const otherDoc = "21000000-0000-4000-8000-000000000010";
    const firstVersion = "61000000-0000-4000-8000-000000000001";
    const secondVersion = "61000000-0000-4000-8000-000000000002";
    const firstChapter = "62000000-0000-4000-8000-000000000001";
    const secondChapter = "62000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into public.library_documents(id,user_id,title,source_kind) values($1,$2,'Second private document','import')",
      [otherDoc, alice],
    );
    await db.query(
      `insert into public.document_versions(id,user_id,document_id,version_key,source_format,rights_statement)
      values($1,$2,$3,'v1','text','User-provided fixture'),($4,$2,$5,'v1','text','User-provided fixture')`,
      [firstVersion, alice, aliceDoc, secondVersion, otherDoc],
    );
    await db.query(
      `insert into public.document_chapters(id,user_id,version_id,chapter_key,ordinal,title,paragraphs)
      values($1,$2,$3,'one',0,'One','["First paragraph."]'),($4,$2,$5,'two',0,'Two','["Other document."]')`,
      [firstChapter, alice, firstVersion, secondChapter, secondVersion],
    );
    await expect(
      db.query(
        `insert into public.reader_positions(user_id,document_id,version_id,chapter_id)
      values($1,$2,$3,$4)`,
        [alice, aliceDoc, secondVersion, secondChapter],
      ),
    ).rejects.toThrow(/foreign key constraint/i);
    await db.query(
      `insert into public.reader_positions(user_id,document_id,version_id,chapter_id)
      values($1,$2,$3,$4)`,
      [alice, aliceDoc, firstVersion, firstChapter],
    );
    await expect(
      db.query(
        "update public.reader_positions set chapter_id=$1 where user_id=$2 and document_id=$3",
        [secondChapter, alice, aliceDoc],
      ),
    ).rejects.toThrow(/foreign key constraint/i);
    await db.query("delete from public.library_documents where id=$1", [
      aliceDoc,
    ]);
    expect(
      (
        await db.query(
          "select * from public.reader_positions where user_id=$1 and document_id=$2",
          [alice, aliceDoc],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select * from public.document_versions where document_id=$1",
          [otherDoc],
        )
      ).rows,
    ).toHaveLength(1);
  });

  it("does not let browser self-reports forge newly added task/independence provenance", async () => {
    await expect(
      withRole("authenticated", alice, (tx) =>
        tx.query(
          `insert into public.learning_evidence
      (id,user_id,sense_id,skill,source,source_version,rubric_version,rating,idempotency_key,task_id,independence)
      values($1,$2,'review','recognition','self-review','self-review-v1','self-review-v1','easy',$1,'forged-verified-task','independent')`,
          [eventId(15), alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      withRole("authenticated", alice, (tx) =>
        tx.query(
          `insert into public.learning_evidence
      (id,user_id,sense_id,skill,source,source_version,rubric_version,rating,idempotency_key,occurred_at)
      values($1,$2,'review','recognition','self-review','self-review-v1','self-review-v1','easy',$1,'2100-01-01')`,
          [eventId(15), alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
