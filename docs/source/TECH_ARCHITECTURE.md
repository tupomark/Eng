# LEXIS Technical Architecture — recommended implementation blueprint

> Архитектура ниже — проработанная **предлагаемая** реализация. Проверять актуальную поддержку Next.js, packages, Auth, ASR/TTS, SQL миграций и AI endpoints непосредственно перед использованием. Не указывать модель GPT-6.1 как точно доступную в API без подтверждения.

## Goals
- True cross-module knowledge engine; high-quality iPhone Safari UX; privacy and explainability; sustainable engineering pace.
- Fast enough first slice; ability to add 14 modules without redesigning database.
- Minimize API vendor lock-in and third-party content license risk.

## Recommended stack
- **Web/PWA**: Next.js App Router + React + TypeScript strict, route-based composability.
- **Styling**: Tailwind + design tokens via CSS custom properties, semantic components; fewer arbitrary one-off inline values.
- **Motion**: Motion for UI microinteractions, hand-crafted SVG/CSS for orb, Rive only if profiling proves quality/performance/maintainability.
- **Data**: PostgreSQL hosted with Supabase (Auth, SQL/RLS, storage for legal user documents), a thin adapter/service layer.
- **Deployment**: GitHub + Vercel, PR previews, environment separation.
- **Quality**: ESLint, tsc, Vitest or comparable unit runner, React Testing Library where useful, Playwright e2e, manual iPhone Safari smoke/perf.
- **Telemetry**: PostHog minimal events/error tracking if configured, no raw private text/transcripts or secrets; opt-in where appropriate.
- **AI**: server-side provider abstraction for tutoring, lexical suggestions, feedback and structured evaluations, schema-validated outputs, cost/timeouts and safety checks.
- **Voice**: adapter for speech-to-text, real-time interaction and text-to-speech; dedicated pronunciation scoring integration if justified.
- **Lexical data**: licensed or appropriately open sources through ingestion abstraction. Lexical content and AI suggestions tagged by origin and version.
- **FSRS**: existing well-maintained implementation where suitable; algorithm/version recorded.

## Suggested repository structure
```text
lexis/
├── AGENTS.md
├── docs/
│   ├── PRODUCT_SPEC.md
│   ├── DESIGN_SYSTEM.md
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── PROGRESS.md
│   └── QA.md
├── public/
│   └── ...app assets, not raw design screenshots as UI backgrounds...
├── src/
│   ├── app/
│   │   ├── (main)/home/
│   │   ├── (main)/library/
│   │   ├── (main)/learn/
│   │   ├── (main)/tutor/
│   │   ├── (main)/core/
│   │   ├── reader/[documentId]/
│   │   ├── voice/
│   │   └── api/
│   ├── components/
│   │   ├── ui/           # base primitives
│   │   ├── glass/        # LEXIS materials
│   │   ├── navigation/
│   │   ├── reader/
│   │   ├── dictionary/
│   │   ├── review/
│   │   └── voice/
│   ├── features/
│   │   ├── knowledge/    # core domain
│   │   ├── dictionary/
│   │   ├── reader/
│   │   ├── review/
│   │   ├── ai-tutor/
│   │   ├── writing/
│   │   └── voice/
│   ├── domain/
│   │   ├── lexical/
│   │   ├── evidence/
│   │   ├── scheduling/
│   │   └── learning/
│   ├── services/
│   │   ├── lexical-provider/
│   │   ├── ai-provider/
│   │   ├── speech-provider/
│   │   └── persistence/
│   ├── styles/
│   ├── lib/
│   └── tests/
├── supabase/migrations/
└── package.json
```
Adapt to actual repository without destructive changes. Keep domain functions independent of React and infrastructure clients.

## Data model: minimal normalized relational shape
`users` (auth identity), `profiles`, `goals`, `learning_preferences`.

Lexical content:
- `lexemes(id, language, normalized_lemma, display_lemma, part_of_speech, ...)`.
- `senses(id, lexeme_id, sense_key, version, definition_en, gloss_ru, register, cefr_estimate, cefr_confidence, provenance_id, ...)`.
- `word_forms(id, lexeme_id, surface, grammatical_tags, ...)`.
- `pronunciations(id, lexeme_id, variant, ipa, audio_source_id, ...)`.
- `examples(id, sense_id, text, translation?, source_id, rights, ...)`.
- `collocations(id, sense_id, expression, ...)`.
- `sense_relations(from_sense_id, to_sense_id, relation_type, source_id, ...)`.
- `content_provenance(id, provider, license, retrieved_at, version, attribution, permitted_uses, ...)`.

User state:
- `user_senses(id, user_id, sense_id?, candidate_lexeme_id?, source_context_id?, intent, added_at, ...)`; supports unresolved imports.
- `learning_evidence(id, user_id, sense_id?, skill, activity_type, evaluation, hints_used, independence, context_id, rubric_version, adjudication_status, occurred_at, ...)` append-only or auditable.
- `competence_projections(user_id, sense_id, skill, estimate, confidence, calculated_at, evidence_version, ...)` derived, not canonically edited score.
- `review_items(id, user_id, sense_id, skill_or_mode, scheduler_state, scheduler_version, due_at, ...)`.
- `review_events(id, review_item_id, evidence_id?, user_rating, evaluation_status, occurred_at, ...)`.
- `reading_documents(id, owner_id, kind, title, storage_ref, rights_state, text_index_status, ...)`.
- `reading_positions`, `reading_highlights`, `context_refs`.
- `writing_documents`, `writing_revisions`, `tutor_sessions`, `tutor_messages`, `voice_sessions`, `goal_progress`, `challenge_cases`.
- `import_batches`, `import_rows` with provisional normalization + dedup decision.

### Important modeling constraints
- Stable internal IDs and source/version history. Sense merges/splits require migration policy; changing an external dictionary sense must not erase evidence.
- Unique/normalized lexeme forms but do not equate same spelling to same sense/POS.
- Data segregation by authenticated owner and row-level policy; prevent leaked corpus/voice transcripts.
- Audit AI reevaluations without retaining full user personal text unnecessarily.
- Store user reading texts separately with configurable retention; don't leak them into analytics.
- Avoid passing `service_role` credentials to browser and distrust client input.

## Domain API contracts (proposals, not actual endpoints yet)
```ts
interface LexicalLookupRequest {
  surface: string;
  language: 'en';
  contextExcerpt?: string;
  sourceContextId?: string;
}
interface SenseCandidate {
  id: string;
  lexemeId: string;
  definitionEn: string;
  translationRu?: string;
  confidence?: 'low' | 'medium' | 'high';
  provenance: string;
}
interface LearningEvidenceInput {
  userId: string;
  senseId: string;
  skill: 'recognition' | 'contextual_comprehension' | 'recall' |
    'writing_production' | 'spontaneous_speech' | 'listening_comprehension' | 'pronunciation';
  origin: string;
  independence: 'independent' | 'hinted' | 'assisted';
  evaluation: 'accepted' | 'partial' | 'not_yet' | 'uncertain';
  contextId?: string;
  rubricVersion: string;
}
```
The exact domain types should be refined with tests, not copied blindly.

## AI service design
- Server-only API keys, explicit provider configurations, model capability registry, budgets per action.
- Structured JSON schemas and validation for feedback, dictionary enrichment, sense suggestion, review judgement and lesson planning.
- Separate safe pre-processing, model invocation, post-validation, uncertainty policy, telemetry (no private payloads) and fallback.
- Model response never trusted as sole authoritative source for lexical data, CEFR, or pronunciation.
- Challenges and human overrides reconciled with evidence/review schedule.
- Streaming UI support but gracefully handles provider failure and rate limits.

## Reader ingestion & copyright
- Support TXT and EPUB via safe client/server parsing (depending on environment), input sanitation, malware/zip bomb limits and size quotas.
- User books copyrighted: private storage, no public indexing, no copying to third-party analytics, no DRM removal. Verify rights and ToS before TTS or text forwarding to AI.
- A highlighted word's contextual snippet can be sent to AI only as necessary and with adequate consent/control.
- User position anchored via stable chapter/paragraph IDs, robust to viewport/font changes.

## PWA and iOS specifics
- HTTPS, manifest + icons, installable where supported, meaningful offline behavior for cached app shell and permitted stored texts.
- Safari dynamic viewport `dvh`/safe area, keyboard resize, scroll restoration, touch selection menu, audio unlock/user gesture permissions, network interruptions.
- Background activity and voice limitations evaluated against current iOS Safari/browser capabilities; no overpromising always-on audio.
- PWA offline data storage and eviction are browser-dependent; don't promise unlimited persistence.

## Security controls
- Auth callback validation, CSRF where applicable, server action/API validation, rate limiting, upload limits, HTML sanitization, content security policy.
- Row Level Security SQL tests, storage policies, user-level deletion and export.
- Cost/rate control for LLM, voice and TTS. Prompt injection defense for imported reading material: treat user documents as untrusted content, never execute document instructions.
- Logs without raw texts/recordings/personal credentials; explicit user permission to store transcripts.

## Performance budget approach
- Set empirical targets after baseline measurement; avoid fictional Lighthouse numbers.
- Optimize mobile LCP, INP, CLS, long-task count, text rendering, and sustainable 60fps motion where practical.
- Avoid global backdrop blur over scrolling Reader; pause offscreen animations; manage memory for EPUB chapters and waveform render.
- Profile low-end iPhone, Safari with reduced motion; static fallbacks.

## Deployed environment boundaries
- `local/dev`, `preview`, `production` separated. DB migrations version-controlled; never apply destructive production migrations casually.
- Frontend build must work without secrets in a clearly tagged demo environment; live features should show explicit `not configured` states until provisioned.
- GitHub actions / Vercel integration checked, not presumed from connected ChatGPT plugins.
