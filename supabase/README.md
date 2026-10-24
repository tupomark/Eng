# PostgreSQL and Auth foundation

Updated 24 October 2026. This foundation is **contract-tested locally**. No hosted project, migration deployment, real Auth/JWT, private Storage or cross-device learning has been verified. The connected development tool returned no projects. Configured SDKs do not establish live readiness.

## Compatible migrations

`20261021223658_knowledge_foundation.sql` is preserved unchanged. The additive `20261022205958_archive_and_atomic_commands.sql` was created with the actual Supabase CLI 2.81.3 (`supabase migration new archive_and_atomic_commands`); the CLI download was SHA-256 checked against its release checksum.

Target PostgreSQL15+ with Supabase `auth.users`, `auth.uid()`, `anon`, `authenticated`, `service_role`. The old five skill IDs remain unchanged; `listening` and `pronunciation` are added. Grammar is a separate concept model. All 17 public tables enable RLS. New collections, source contexts, versioned document chapters, unresolved imports and writing revisions have owner-scoped reads and server-only writes. The two `lexis_private` tables have no browser usage grants. Functions are invoker-only with empty search paths and revoked public/browser execution.

## Archive, purge and freshness

`user_saved_senses.archived_at` preserves evidence/disputes/context. The old evidence/projection cascade FKs become deferred `NO ACTION`: ordinary deletion of a practised relationship fails, while undo of an unpractised save still works. Separate account FKs retain explicit account deletion cascades.

Explicit `purge_saved_sense_command` requires `DELETE HISTORY: <senseId>` and atomically removes only the selected owner's evidence, disputes, projection, intent, source contexts and collection links. Minimal private command receipts remain for idempotency; production retention/cleanup and deletion tombstones are still an integration gate. Account deletion removes owned receipts/mappings too. This is not a complete account-deletion endpoint or private-file/backup purge guarantee.

Insert triggers stamp `recorded_at` without privilege escalation. Even a backdated direct browser dispute makes older projections unreadable through RLS. Review/dispute RPCs also delete affected cached projections transactionally. A server competence/FSRS projector must rebuild before returning fresh estimates: **that projector is not yet wired**. Missing/invalidated projection is not zero mastery.

Document deletion removes its versions/chapters/position and clears source links; short saved excerpts remain until explicitly cleared. Structural anchors enforce owner + actual document + version + chapter. Independent removal of a referenced version requires an explicit anchor-recovery transaction. New ingest metadata tables are contracts, not proof of a hosted material repository or private Storage policies.

## Atomic commands

`POST /api/learning/command` checks same-origin bounded JSON and derives the actor with `getUser()`. Client owner, score, provider or full-profile snapshot fields are rejected. The private trusted client executes:

| Action / RPC                                                  | Inputs beyond verified actor                                | Result                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `archive-sense` / `archive_saved_sense_command`               | sense, key, expected revision                               | Archived intent; retained history                           |
| `self-review` / `record_self_review_command`                  | sense, event UUID, key, rating, UTC time, expected revision | One self-reported recognition event; projection invalidated |
| `dispute-evidence` / `dispute_evidence_command`               | owned event UUID, key, reason                               | Exclusion, original audit retained, projection invalidated  |
| `purge-sense` / `purge_saved_sense_command`                   | sense, key, explicit confirmation                           | Selected history removed                                    |
| `append-writing-revision` / `append_writing_revision_command` | draft/revision UUIDs, parent or null, text, key             | Revision appended; stale parent preserves a conflict branch |

User/key advisory locks serialize retries. Different payload with the same key fails. Receipts contain fingerprints rather than draft bodies. Row locks and non-null revision guards detect stale changes. A failed constraint rolls back the command and its receipt. Uncertain delivery is never reported as saved; retain key/input for retry. New headers/material imports and projections still need complete server use cases before the UI can offer cloud sync.

`legacy-id.ts` derives RFC9562 UUIDv5 from a fixed namespace + `[authUserId, entityNamespace, originalLegacyId]`. Original local IDs stay in exports; identical legacy names in different owners/entities map separately. `map_legacy_id_command` persists each mapping once and rejects remapping. This is identity mapping, not authentication. Complete preview/consented account import and merge/two-device verification remain outstanding.

## Optional Auth surface

`/account` supports email/password sign-in, sign-up/confirmation, recovery/new password and current-session sign-out through server routes. Without configuration it explicitly stays unavailable while local reading/practice remains useful. Signing in does not automatically upload books, drafts or history. Existing local learning remains a separate on-device workspace; it is not assigned to the signed-in user silently.

Adapters use documented `@supabase/ssr`0.12.7 and `@supabase/supabase-js`2.118.0. Each request gets a fresh SSR client. Scoped `src/proxy.ts` refreshes claims; mutations call `getUser()`. HttpOnly SameSite=Lax cookies are server-managed; no browser SDK client is introduced. SSR `setAll(cookies,cacheHeaders)` propagates no-store headers. Private responses are not cacheable. Auth requests have a deadline; callback return paths cannot be external URLs. Logout emits `lexis:account-session-ended`; capture/request owners must clean up on this event.

Configure via hosting secret storage or a gitignored local env file, never Git/chat:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
# Trusted commands only; never NEXT_PUBLIC:
SUPABASE_SECRET_KEY=your-server-secret
# A legacy SUPABASE_SERVICE_ROLE_KEY fallback is also supported.
LEXIS_APP_ORIGIN=https://your-lexis-host.example
```

An operator must inspect/back up an approved isolated development project, review migrations, apply them and run advisors. No remote migration or production reset was performed. Configure Auth Site URL, exact `<LEXIS_APP_ORIGIN>/auth/callback` redirect allowlist, confirmation/recovery email delivery and separate local/test origins. Real A/B/anon JWT, expired/revoked sessions, refresh/logout/account switch, storage/signed URLs, projector and two-device tests are gates before a pilot.

## Verification and limits

```sh
npm run test:db
npx vitest run tests/unit/server-boundaries.test.ts tests/unit/supabase-command-adapter.test.ts
npm run typecheck
npm run build
npx playwright test tests/e2e/account-boundaries.spec.ts
```

Fresh targeted results 24 October: **26/26 DB tests** (10 baseline +16 new), **19/19 server-boundary/SDK-contract tests**; targeted lint passed. Strict TypeScript passed on the initial integrated Auth implementation and is rechecked in the final root run. E2E awaits the rebuilt integrated application after the origin fix at this checkpoint; root's PROGRESS records final results/SHA. Tests execute real PostgreSQL via PGlite with minimal Auth stubs, and the installed SDK with controlled HTTP fixtures. They are not live Auth/PostgREST/JWT verification. PGlite has one connection; stale-parent/retry regressions do not establish hosted multi-connection concurrency performance.

Integrated browser tests exposed a real bind-address bug: Next's internal request URL used `0.0.0.0` while the browser used `127.0.0.1:3000`. Same-origin commands were wrongly rejected and callbacks lost the browser address. The shared origin resolver now prefers explicit `LEXIS_APP_ORIGIN`, otherwise validates the actual Host and preserves its port; arbitrary forwarded host/proto headers cannot override it. A reverse proxy that rewrites Host must set the explicit site origin. Fixtures cover both legitimate bind-address requests and forged forwarded-host requests. Foreign/missing origins remain rejected.

Coverage: archive/purge/account cascade, retry/key mismatch, stale/null revision, invalid clocks, challenge after later events, timestamp freshness, writing conflicts, cross-user source/parent ownership, structural anchors, private receipts/mappings and unresolved imports without invented knowledge. No hosted advisors, private file policies, backup restore drill or hardware Safari checks have run. Production receipt/file/backup retention and representative query-plan measurements remain required.

Official docs consulted: [SSR clients/cookie headers](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog](https://supabase.com/changelog.md). Its relevant TLS breaking change disables older CBC TLS1.2 ciphers on10 November2026; use modern runtime/client support.
