# Quality assurance, testing, release, accessibility, privacy

## Non-negotiable acceptance
- App renders and works on iPhone Safari viewport; no clipped notch/home indicator, broken input focus or bottom nav collision.
- Text on clear contrast-controlled surfaces. Last user preference «background must not stand out when text exists» validated visually, not merely stated.
- Reader selection/tap doesn't lose reading location; dictionary sense choice intentional.
- Import doesn't mark unknown; Save doesn't mark known; only meaningful independent evidence changes competence.
- User can challenge AI-verdict without losing history.
- Voice UI correctly communicates actual available functionality; don't imply live speech evaluation without API.
- No third-party copyrighted text/images shipped unlicensed, no developer keys exposed.

## Unit testing
- Lemmatization/source normalization and sense disambiguation fallback.
- Dedup/merge import rows, reversible operations.
- Evidence projection for recognition/comprehension/production; challenged events excluded/reconciled.
- Scheduling boundary cases and clock issues; stale and duplicate review events.
- Schema parsing/validation for AI structured output and error fallback.
- Grammar/Writing feedback split and source-to-evidence mapping.

## Integration/E2E
- First-time empty state → add book/demo document → open → select → lookup → choose sense → save → review → reload → progress persisted.
- Invalid/ambiguous lookup, timeout, offline, permission denied, signed-out, loading and retry.
- Long import with duplicates; large reader; interrupted voice session.
- User ownership and RLS, token expiry, document security, no cross-user leakage.
- Accessibility keyboard/screen reader controls and text size scaling.

## Visual regression
Screens for mobile Home, Library, Learn, Tutor, Core, Reader, Quick Dictionary, Full Dictionary, Voice Idle/Listening, Writing Studio, Goals, empty/error states. Compare iPhone-type viewport to assets and **current** visual instructions; screenshots are for review, not automatically perfect matching.

## Browser/device matrix
- iOS Safari as top priority with actual hardware if available; Chrome Android and desktop Safari/Chrome/Firefox afterwards.
- Test notch safe areas, dynamic viewport when keyboard appears, selection gesture, font zoom, reduced motion, battery and sustained animations.
- Synthetic Playwright mobile emulation **cannot fully replace hardware Safari checks**.

## Accessibility
- WCAG-oriented contrast, focus states, semantics, labels, tap target and keyboard access, reduced-motion, non-color communication for errors/strength, subtitles/transcript options.
- Font scales; IPA rendering and screen-reader pronunciation controls.
- Semantic `<button>`/`<dialog>`/headings rather than click handlers on divs.

## AI evaluations
- Rubric versioned and human-testable with multilingual ambiguous answers.
- Stress-test hallucinated word senses and wrong translations, overconfident CEFR, accepted alternatives, idioms, register mismatches, AI uncertainty.
- Track false positive/negative in assisted judging; gated rollouts for changing rubric/model.
- Prompt injection tests against imported text and external sources.

## Security and legal
- Data isolation by owner, secure file handling, vetted providers, purpose limitation, informed consent, deletion/export, restricted retention.
- Books/essays/transcripts are private user inputs, never sent to analytics or training without clear controls and provider policies.
- Never bypass DRM. Verify dictionary licenses and pronunciation audio redistributions.
- Document AI model costs, API quotas, tokens/second, rate limiting and fallback.

## Observability
- Non-sensitive actions: Reader opened, lookup shown, sense chosen, item saved, review completed, user-challenged, voice session started/failed, error class and duration.
- No raw document body, words from sensitive private excerpts, audio, API secrets or full tutor conversations in third-party event analytics by default.
- Distinguish activity counters from learning success.

## Report template for each PR
- Changed pages/components and underlying domain logic.
- Recorded verification commands/outcomes.
- Real screenshot(s) mobile and desktop where available.
- Comparison to UX/visual acceptance; list gaps and why.
- Tests missing, disabled or flaky (never silently hide).
- Security, licensing and accessibility impact.
