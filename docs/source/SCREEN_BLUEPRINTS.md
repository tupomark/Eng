# Detailed screen blueprints for visual engineering

These describe behavior/content priorities, not frozen screenshots. All components must be responsive DOM, accessible and backed by real state or explicit demo fixtures. The final aesthetic is defined by `VISUAL_DESIGN.md` and reference gallery.

## Global shell and navigation
- **Mobile**: top safe area respect dynamic island / status bar; navigation between Home, Library, Learn, Tutor, Core; minimalist icons with labels or discoverable stable names; bar low-salience frosted glass, never obscures content; safe-area aware.
- **Desktop**: quiet sidebar; content centered, max reading width; contextual secondary panel for lookup/details.
- Universal search / LEXIS Command: lexeme, sense, document, lesson, quick action; keyboard shortcut desktop, clear touch affordance mobile.
- Theme first is dark-only; bright theme not required yet. User locale EN/RU/mixed, language toggles in settings.

## 0. Entry / Splash / pre-auth
- Single sculptural dune-like soft volumetric gradient and compact LEXIS wordmark. No giant logo gradients or unnecessary screen transition delays.
- Tactile calm atmosphere and no false onboarding progress.
- On first run, optional placement, objective selection, skip, import and reading choices. Avoid forcing account creation for a purely illustrative trial if product architecture permits.

## 1. Home / Balanced Living Home
**Primary hierarchy:** greeting (short) → resume learning (book/voice/review) → subtle Living Core or current momentum → contextual next action(s) → quick routes.
- User should know what to do in 3 seconds.
- Content states: no content/new user, reading-in-progress, due cards, insufficient evidence, returning after break, offline.
- Widgets are not mandatory just because the reference shows them. Prefer generous margins and 2–3 strong elements.
- Decorative warmth may appear in ambient header but recedes behind paragraphs.

## 2. Reader fullscreen
**Primary hierarchy:** chapter and reading text, uncluttered. Top bar back, reading options, bookmark. Bottom optional page/progress, hidden on immersive focus if user chooses.
- Tap versus long-press needs native interaction design. Avoid breaking iOS text-selection handles or standard copy behavior.
- Context popover/backdrop anchoring reflows safely near edges; word highlighting must not swallow selection.
- Controls font size, line spacing, optionally serif reading typography if user chooses, not forced.
- Book progress based on stable structural location, not just scroll pixel.
- Reader supports 'My Understanding' optional per segment, skip and revisit; spoiler-aware AI.

## 3. Dictionary Quick View
- Display selected surface form and lemma (where different), suggested sense and confidence, IPA/variant and audio only if verified source available.
- Definition EN, concise RU gloss, usage example from licensed source or clearly generated/private context, save action, expand to Full Entry.
- Ambiguous multiple senses list, manual override and appeal. Keep no more than necessary in first panel.
- On save, status indicates added to study pool, not 'mastered'.

## 4. Dictionary Full Entry / Deep Dive
- Full senses with grouped POS, pronunciations, examples and collocations with provenance, labels like register and contextual suitability.
- Deep Dive: nuances, synonyms, confusions, grammatical patterns, mnemonic or explanation variants; low-confidence AI additions distinctly labeled.
- Scroll and sticky controls not trap reading position. Long content has progressive sections.

## 5. Voice Practice fullscreen
- Surface dominated by single tactile fogged translucent orb with minimal mic/wave center icon.
- States: idle (quiet ready), permission prompt (explain), listening (soft response), processing (non-thrashing), speaking (subtle responsive), paused, timeout, error, network recovery.
- Actions: tap/hold microphone depending on live/PTT selection, transcript option, accent/language, scenario choice, exit, privacy/recording control.
- Post-session: short useful recap, strongest skill evidence only if ASR/evaluator validated; show uncertainty where needed.
- Require no endless purple glow, no heavy sphere on busy background. Reduced motion static orb communicates state in text/icon.

## 6. Library / collections
- Real book cards with cover only if owned/license permitted; otherwise elegant typographic/abstract placeholders.
- Rows: Continue reading, Your documents, Vocabulary/collections, Smart Inbox; search, import.
- Each collection displays count and activity semantics accurately (e.g., 342 added, not 342 known).

## 7. Learn hub
- Quick/Focused/Free Exploration/Goal Training switch or natural controls.
- Low-stress recommended next practice, due reviews, Grammar Atlas, Listening, Writing.
- Session picker Guided Lesson / Conversation Lab / Weakness Workshop / Real-Life Simulation / Knowledge Check.
- Avoid showing all study activity cards at once.

## 8. Smart Cards / Review
- Prompt-first visual, private low-distraction focus. Response may be text, speech, selection or listening.
- Clear 'show hint', submit, evaluated outcome, why, challenge, next. Make it impossible to confuse a visually green tick with knowledge proof absent valid rubric.
- Accessible feedback with proper keyboard/SR support and undo when grading uncertain.

## 9. Writing Studio
- Writing canvas with stable contrast and hierarchy, no decorative bright dunes behind text.
- Modes Write/Feedback/Improve, text length, autosave/versioning, optional rubric per task.
- Inline highlights separated as errors vs style opportunities. Original text always preserved; applying improvement is explicit.
- Grammar Atlas link shows compact context panel; return to draft with caret/scroll restoration.

## 10. Listening Studio
- Audio focus, waveform/progress, speed/repeat chunks, transcript reveal steps.
- Comprehension without revealed transcript tracked separately from aided replay/reading.
- Shadowing optional; accuracy estimates explained.

## 11. Tutor
- Minimal conversational interface; contextual header identifies Current Reader/Grammar/Goal only with permission.
- Mentoring mode selector is unobtrusive; progress from specific observed difficulty, not generic advice.
- AI outputs are streaming-capable, retryable, distinguish assisted explanation from assessment.
- Focused exercise cards embed via shared component library and return evidence to core domain.

## 12. Core / Knowledge Observatory
- Opening as sculptural Living Core + evidence-grounded explanatory summary, not a dashboard filled with numerical rings.
- Detail per skill, sense, time, review needs, goals; clear distinction between activity and demonstrated knowledge.
- Semantic Network optional deeper panel; no confusing visualization by default.
- Handle few-data/no-data without invented percentile scores.

## 13. Goals
- User chooses target; Tutor proposes if useful and user confirms any adjustments.
- Long-term, short-term, study cadence and domain objectives; progress with source, confidence and user control.
- No penalty/shame for days off; avoid fabricated motivational 'streak' claims.

## 14. Settings / Profile
- Language/immersion (EN/RU/mixed), accent BrE/AmE, correction density, narration/transcripts, accessibility/reduced motion, privacy controls, export/delete, connected services.
- Private recordings/transcripts default retention explicit and configurable.

## Surface priorities by content density
- **High expression/illustration:** splash, some Home atmosphere, Voice orb, Core.
- **Medium expression:** Library and Goals; decorative material confined to card backgrounds.
- **Near-zero decoration behind text:** Reader, Dictionary definitions, Writing canvas, Tutor long responses, Grammar lessons.

## UI review constraints
- Target screen screenshots must be from built app, not the 18 reference images.
- Verify with populated text, long Russian translations, long book paragraphs and keyboard; a layout that only handles 1-sentence AI mockup is not complete.
