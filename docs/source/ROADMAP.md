# Roadmap, sequencing and acceptance

## North star
Пользователь открывает LEXIS на iPhone, продолжает читать реальный текст, получает точное значение слова и контекст, сохраняет его для осознанного изучения, позже использует и проверяет знание, а потом видит честное отражение прогресса.

### Phase 0 — Discovery / audit
- Find actual repository, docs, design assets and integration environment.
- Read 5 curated visual references and product docs; form initial architecture and ADRs.
- Define semantic tokens, data schema draft, privacy assumptions, licenses unknown, main user scenarios.
- Deliver repo assessment and plan, no false implementation claims.

**Done when:** current source of truth and blockers documented; no invented external integration.

### Phase 1 — Foundation and authentic design system
- Next.js, TypeScript strict, routing, global layout, responsive mobile navigation and focused workspaces.
- Semantic palette, readable glass surfaces, typography, icon system, safe-area, motion primitives and reduced-motion variants.
- Home scaffold with realistic data states, navigation to Reader/Library/Learn/Tutor/Core.
- Voice visual concept real SVG/CSS/animation primitives, states and reduced-motion.
- Test/check CI scaffolding and visual screenshot harness.

**Done when:** mobile views render as functional DOM and pass baseline smoke checks; no bitmap fake UI.

### Phase 2 — First vertical learning slice
- Reader imports/opens permitted demo TXT; chapter segmentation, bookmarks and position.
- Contextual tap/selection → Quick Dictionary with sense candidates and clearly documented source/provenance.
- Add to learning intentionally; storage and idempotency, undo and return to exact position.
- Smart Inbox + first simple review task → evidence logged → schedule updated → Core displays explanation of observed state.
- Tests for Reader→Dictionary→Save→Review and sense-level disambiguation.

**Done when:** a user genuinely completes flow end to end after refreshing/reopening, and skill tracking does not infer knowledge from saving.

### Phase 3 — Adaptive educational core
- Robust lexical import (Reverso supported exported formats, CSV/TXT/XLSX), normalize/dedup/manual disambiguation, provenance.
- FSRS-grade scheduling and multi-skill review strategy; AI verification with challenge and uncertain answers.
- AI Tutor context adapters with permissions, recommendation logic and clear fallback.
- Expand Grammar, Writing and Knowledge Observatory with real evidence logic.

### Phase 4 — Multimodal completeness
- Voice live and push-to-talk with actual ASR/TTS, speech state telemetry and consent.
- Evaluate dedicated pronunciation scoring; avoid ASR-as-grading.
- Listening Studio, Shadowing, advanced Reading TTS, error-driven exercises.
- Personal Corpus, Semantic Network and broader Knowledge Flow.

### Phase 5 — Release quality and validation
- Cross-device testing, latency, PWA, offline states, localization, private content handling.
- Accessibility audit, privacy and license review, telemetry instrumentation, security posture.
- Performance profiling, reliability, user testing, analytics sanity checks and iterative polish.

## Suggested first sprint task breakdown
1. Define tokens/components/screen architecture and write `DESIGN_SYSTEM.md`.
2. Build AppShell + navigation + five-route placeholders with functional destinations and truthful states.
3. Home with resume card and simple Living Core visual.
4. Reader real text layout + selection/touch behavior + position restoration.
5. Dictionary data model + mock source clearly labelled + context view.
6. Save item to local/demo persistence or Supabase after credentials verified; true read/write or explicit ephemeral mode.
7. Review prompt + deterministic answer evaluation + evidence persistence.
8. Voice orb state machine with mock transitions clearly marked.
9. E2E integration and real UI screenshots for visual comparison.

## Requirements traceability
Each issue should link to relevant section in `docs/`, acceptance criteria, tests, design screenshot, and status (`proposed`, `implementing`, `verified`, `blocked`). Suggested Linear issue taxonomy: Foundation; Design System; Reader; Dictionary; Learning Model; Smart Review; Voice; Tutor; Writing; Listening; Grammar; Analytics; QA.

## Reporting status
Use `docs/PROGRESS.md` format:
- Date / commit / milestone.
- Implemented vs mocked vs integrated.
- Tests run and results.
- Visual evidence and known gaps.
- Next task, risks and decisions needed.

## Prioritization
No scattered prototypes first. Prioritize foundation of data+design and one beautiful, honest, end-to-end slice. Later expansion should reuse these primitives.
