# S5 — AI contracts and a private Tutor workspace

Status on 24 October 2026: `implemented-local` and `contract-tested` for the scope below; real AI remains `awaiting-configuration`. These changes are uncommitted at this checkpoint (parent HEAD `23fca53`). This is an engineering choice of an optional OpenAI adapter, not a statement that a provider/model was historically approved or is live.

## What works locally

`/tutor/chat` stores a question, pending request, conversation, teaching style, session type and user-controlled outline in the current browser profile. Mentor, Examiner and Companion have different prompt policies; all five approved session types have defined purposes and three outline steps. Advancing an outline does not mark a lesson complete. Without configuration the UI keeps the draft and explicitly reports that no real Tutor reply or learning assessment was produced. There is no canned assistant conversation.

A Reader passage is transferred through the bounded, tab-local Dictionary context ledger. Its text is absent from URLs. Passage inclusion, recent-history inclusion and external processing have separate permissions, initially off. Request history is limited to 12 messages and excludes every message derived from a source whose permission has been removed. No hidden summary or full-book retrieval is performed. A request carries at most 1,000 characters of selected passage, eight source IDs and a 6,000-character question; the total transport is bounded. The return link uses the existing internal-path allowlist.

The browser repository validates data and preserves unreadable bytes. Keys are `lexis.tutor.v1:local` or an explicitly authenticated account scope. Best-effort raw-value comparison detects stale tabs; this is not a transactional cloud repository. Corrupt history can be exported from the recovery state. Stored questions and the original pending request survive refresh; checking the same request reuses its ID. Conversation reset is confirmed and limited to the selected profile.

Cancellation and permission withdrawal abort the current transport, retain the draft and ignore late replies. Double taps are guarded synchronously. Account checking, account-session end, unmount and full local-profile purge stop active requests. A purge marker blocks reopening/late writes. A changed account clears retained context permissions; asynchronous account checks have generation guards. These are local/contract protections, not proof of hosted multi-account isolation.

## Server boundary and provider adapter

- `/api/ai/capabilities` separates supported/configured from available-now/live-verified. Environment presence never produces a verified-live badge.
- `/api/tutor/message` validates same origin, bounded input, current server Auth, permissions/scope, idempotency and cost reservation before an optional provider invocation.
- `/api/ai/verify` resolves an authored target task on the server, rejects client-supplied owner/provider/score fields and returns **advisory-only** feedback with `evidenceSaved:false`. It cannot grade listening, speech or pronunciation from a text response. An ambiguous task abstains without a provider request.
- `/api/ai/replies` requires same origin, current server Auth, exact `CLEAR AI REPLY CACHE` confirmation and an expected-account guard. It clears only that actor's delivery cache, seals pending reservations against late resurrection and retains cost/idempotency receipts. It does not promise deletion from provider-held records or backups. Local conversation deletion can request this separately for a signed-in account; failure preserves the local conversations and reports that deletion was not confirmed.

`AiPipeline` depends on provider/quota/identity ports. The optional REST adapter uses the fixed official `https://api.openai.com/v1/responses` endpoint, explicit model ID, `store:false`, strict JSON schema, no tools, no arbitrary URL and no automatic provider fallback. This first adapter deliberately buffers a bounded response (`stream:false`); it does not claim streaming is complete. API refusals, malformed/incomplete JSON, invented citations, wrong task/skill, fabricated answer quotes, timeout, cancellation and quota failures do not create evidence or negative learning scores.

A final response passes runtime shape and semantic checks. Actual provider/model, rubric/policy and request identity are retained. Retry receipts keep the validated original provider envelope, so semantic verification replays through the same task/skill validator instead of misreading a transformed TaskEvaluation. No learning event, competence projection or FSRS rating is written by this advisory pipeline.

## Quotas, storage and retention

The CLI-created additive migration `20261024055040_ai_request_reservations.sql` is not applied remotely. The private RLS-enabled journal is browser-inaccessible. Invoker-only service RPCs reserve a conservative upper-bound cost under a global advisory lock, check per-user/global UTC-day budgets and daily request count, and provide retry/conflict receipts. RPCs have 10-second deadlines. Auth and provider processing have separate deadlines. In-flight/cancelled requests keep their reservation because final provider billing after cancellation is uncertain; there is no automatic costly retry.

Only bounded validated delivery replies, not prompts or book excerpts, are cached by this journal. Cached generated replies can nevertheless contain private derived content. Their default expiry is 24 hours; the operator must schedule `lexis_private.expire_ai_reply_cache()` and verify cleanup before a pilot. Expired cache deletion retains minimal quota/idempotency tombstones. The explicit owner-cache deletion RPC also seals in-flight reservations; late completion is rejected. Account deletion cascades to this journal. Hosted backup retention, receipt lifecycle and a real deletion drill remain gates.

## Required configuration and live verification

No application AI key, authorized API budget or hosted Supabase project was available. No paid request, remote migration or live AI evaluation was executed.

Set these only in server secret/config storage, after reviewing actual provider model access, current prices, region, retention and rights:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SECRET_KEY` (or legacy service-role key), and canonical `LEXIS_APP_ORIGIN` for the reviewed test environment.
- `LEXIS_AI_ENABLED=true`, `LEXIS_AI_PROVIDER=openai`, `OPENAI_API_KEY`, `LEXIS_AI_MODEL` with a genuinely available API model ID. There is no default model or inferred ChatGPT API entitlement.
- `LEXIS_AI_MAX_OUTPUT_TOKENS` (128–8,192), `LEXIS_AI_DAILY_REQUEST_LIMIT` (1–500).
- `LEXIS_AI_DAILY_BUDGET_USD`, `LEXIS_AI_SERVER_DAILY_BUDGET_USD`, `LEXIS_AI_INPUT_USD_PER_MILLION`, `LEXIS_AI_OUTPUT_USD_PER_MILLION`, set from approved budgets and the selected model's current actual prices. Missing/invalid values disable invocation; sample prices are not supplied.

After configuration: apply reviewed migrations in the authorized isolated test project, verify Auth/callback and A/B/JWT boundaries, schedule reply cleanup, then run a small explicitly authorized request for every style/session combination and negative case. Record the real model response ID/provenance, actual pricing assumptions, latency and final data state. A successful configuration read or fixture does not close this gate.

## Fresh checks for this feature

On 24 October 2026, the integrated working tree based on parent HEAD `23fca53` ran:

- `vitest run tests/unit/ai-pipeline.test.ts tests/database/ai-quota.test.ts`: **24/24 passed** (19 unit/adapter fixtures, five real PostgreSQL-engine tests with Auth stubs), duration 4.88 seconds, started 11:10:53 UTC.
- Scoped ESLint covering AI/Tutor source and tests, `--max-warnings=0`: passed in the same command.
- `npm run typecheck` and final Tutor-file ESLint passed again after the last account-generation cleanup (24 October, approximately 11:14 UTC). Final production-build/browser results and exact committed SHA are recorded by the root run, not inferred here.

Regression scope includes verification replay, all three style/five type prompt policies, valid alternative semantics as a provider fixture, ambiguous prompt abstention, wrong skill/fabricated quote, invalid citations, no configuration/Auth, simultaneous/repeated submission, cancellation during quota reservation, late results, refusal/malformed/partial output, quotas, private SQL grants, owner-specific cache purge and late-completion rejection, local stale/corrupt storage, revoked context and purge-marker write guards.

Five new browser stories per engine cover unavailable capability + reopen/export, Reader consent/return, cancellation, permission withdrawal and server endpoint boundaries. These require the rebuilt integrated application; no browser pass is claimed in this feature note before the root run.

## Remaining product gates

This does not close M03/M13/S5 in full. Real provider quality/billing/rights/region verification, streaming, server-owned conversation persistence/sync, trusted task-evidence writes, AI verdict Challenge/replay integration, tool-created tasks from Tutor, context help from Writing, inspect/edit/retention for long-term memory and actual teaching outcomes are still incomplete. Voice ASR/TTS/live and a specialized pronunciation scorer are separate capabilities. Local session outlines are not substitutes for completed guided lessons, and fixtures are not evidence of pedagogical accuracy.

## Documentation consulted

The current official [Responses create reference](https://developers.openai.com/api/reference/resources/responses/methods/create) was retrieved on 24 October; it confirms `instructions`, `input`, `store`, `stream`, `max_output_tokens`, strict `text.format` schemas and the completed/refusal/output-text/usage envelope. Its example model names are not treated as project model-access verification. The current [Supabase changelog](https://supabase.com/changelog.md) and [JavaScript abortSignal reference](https://supabase.com/docs/reference/javascript/abortsignal) were checked alongside installed `supabase-js` 2.118.0/PostgREST types. The announced TLS cipher removal affects obsolete clients, and does not remove the need to test the actual target Safari/server environment. No hosted advisor or JWT call ran without a project.
