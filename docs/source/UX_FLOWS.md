# UX, IA, navigation, contextual workspaces

## Navigation
**Five primary destinations:** Home, Library, Learn, Tutor, Core. Mobile bottom navigation with icons + accessible labels, deliberate hierarchy; desktop sidebar (not desktop-first controls shrunk to mobile). Universal **LEXIS Command** lets user search lexemes, senses, books, cards, grammar and actions.

### Home — Balanced Living Home
- Greeting + calm small message; user-controlled resume card above the fold.
- Living Core as tactile subtle focal area indicating overall learning, not false pseudo-science.
- Quick access to continue Reader / Voice / Review, personalized recommendations grounded in evidence.
- Allow dashboard without interrupting focus or presenting 14 large cards.
- Useful empty state for brand-new user; don't fabricate streaks/metrics.

### Library
- Books/documents, imported vocabulary, curated study collections, sources, search/filter, progress.
- Smart Inbox for imports, duplicate triage, unfinished study candidates.

### Learn
- Guided Lesson / Review / Grammar Atlas / Listening / Writing; goal-based discoverability.
- Contextual assistant and continuation, Quick / Focused / Free Exploration / Goal Training.

### Tutor
- Dedicated conversation interface, text and voice entry, adaptable styles Mentor/Examiner/Companion and session types.
- Explain assessment, allow corrections and change teaching approach; retain context only when allowed.

### Core
- Living Core primary portrait + Knowledge Observatory detail. Skills across comprehension/writing/speech/listening, goals, semantic connections, evidence provenance.
- Explain what measurement means; avoid claims like «328 words known» unless computation is defined.

## Workspace model
1. **Quick Interaction**: mini-card popover, quick lookup, one tap action.
2. **Context Panel**: expandable detail while retaining underlying activity.
3. **Dedicated Workspace**: fullscreen Reader, Voice, Writing where task warrants.
4. **Persistent Context**: source highlights, progress, conversation context retained across transitions.

## Onboarding
- Welcome + goals, optional language placement, allow skipping.
- Self-reported preferences vs inferred Learning DNA always distinguished.
- Show 2–3 helpful actions rather than forced 20-step survey.
- Invite Reverso import or adding first book; let user choose.
- Accessibility/screen reader, voice permissions when voice first used, not universally on opening app.

## Critical journey A: Reader to review
1. User opens own legal TXT/EPUB or seeded **clearly labelled demo** sample.
2. Text is focus-optimized, clear sans/reader mode; line width, font size, spacing controllable.
3. Tap/long-press `reluctant` → anchored Quick View, preserves position and selection.
4. Contextual disambiguation suggests sense with visual affordance to change it; displays usage and audio where available.
5. User taps «Save for learning»; app tracks source passage/context/meaning and pending study intent, not inferred ignorance.
6. Continue reading without losing place.
7. Later review queue shows appropriate contextual retrieval prompt, not an obvious multiple-choice only.
8. Answer updates evidence and review schedule with honest explanation; corrections can be contested.

## Critical journey B: Import vocabulary
Paste/export file → inspect source → preview/normalize/dedup → sense ambiguity → accept/edit/reject → Smart Inbox → individual study plan → contextual use. Must handle 1k+ entries incrementally without browser lock-ups.

## Critical journey C: AI Tutor help
Open from current Reader passage → Tutor knows highlighted text with permission → asks what type of help needed → concise answer with meaning and alternatives → optional training item → return to exact reading position.

## Critical journey D: Writing → Grammar
User drafts → optional check → feedback sorted errors vs style → sees why, edits himself → grammar concept link → tailored exercise → evidence only on independent production.

## Critical journey E: Voice
Launch fullscreen → permission/onboarding → choose live or push-to-talk → clear microphone state → listen/speak → delayed or inline feedback based on preference → transcript if enabled → recap with uncertainty, pronunciation assessment only if specialized scorer available.

## Design states (every screen)
- Empty first use, loading/skeleton, successful with real data, permission denied, offline, timeouts, unavailable API, error, retry, save and undo, keyboard open, accessibility label, reduced motion.
- Support dark soft keyboard viewport, Safari dynamic toolbars, safe-area bottom inset, selection/context menu, back navigation, session restoration.

## Desktop adaptation
Preserve desktop reading and writing max line length, sidepanel dictionary, left navigation, optional double-pane Reading. Desktop is extension, not new product.

## User control
Adaptivity recommendations explicit and dismissible; confirmation for adjusting goals; provide full manual navigation, export/delete personal learning data, adjust correction intensity and language mode.
