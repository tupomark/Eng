# Development tools versus actual LEXIS service integrations

## Already discussed tools available in ChatGPT ecosystem
- GitHub — repository/changes/PR review.
- Vercel — deployments and preview environments.
- Supabase — PostgreSQL/Auth/storage, subject to actual project credentials and permissions.
- PostHog — privacy-aware feature/product analytics and errors.
- Context7 — reference for current library/API docs.
- Hugging Face — inspect relevant models/datasets; not a default production model source.
- Firecrawl — external research/scraping of permitted pages/documentation; respect terms and content rights.
- Figma, Canva, Adobe — design/reference exploration; MagicPath and Lovable available for rapid exploration.
- Linear — issue planning and traceability.
- TinyFish — browser-assisted research and non-authoritative functional exploration; Playwright/real Safari tests still needed.
- OpenAI Developers — may be suggested/available; connection status must be checked. Do not assume installed.

## Crucial boundary
Connecting a plugin to ChatGPT **does not install an SDK in LEXIS, configure billing, provide server credentials, license content, or confirm production integration**. Record each app's actual project ID/status only after verified with tools and user authorization.

## Potential production services (requiring independent selection)
- AI Tutor: model API with structured outputs and low-latency streaming, token budgeting and fallback.
- Speech ASR/TTS for real-time voice; optional dedicated pronunciation scoring service, e.g. Azure Speech Pronunciation Assessment if license/quality meets needs.
- Dictionary: licensed or sufficiently open, trustworthy sense-level entries; coverage of IPA, BrE/AmE, examples, collocations, POS, usage, RU translations, provenance.
- Grammar checks: AI with schema-validation and perhaps LanguageTool as separate rule-based corroboration.
- Smart Review: FSRS algorithm implementation; not necessarily an external paid API.
- Audio/video content: legal sources or user-uploaded rights-cleared media; transcript alignment support.
- Vector search/embeddings only where they improve retrieval meaningfully; not a substitute for explicit sense IDs.

## Technical governance
For each selected integration document: purpose, provider, terms/license, data shared, region/privacy implications, credentials location, quotas/rates, latency, graceful fallback, evaluation criteria and test fixtures. Distinguish browser plugins from product APIs throughout status reports.
