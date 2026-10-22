# Acceptance matrix — what can be declared implemented

Do not mark a module complete because a screen exists. Each feature requires functional data, meaningful transitions, errors handled, a verification trail, and privacy/copyright awareness where relevant.

| Module | Minimum honest functionality | Evidence of completion |
|---|---|---|
| Dictionary | Lexeme lookup; explicit sense selection; provenance; audio fallback | Tests for polysemy + screenshot + exact provider state |
| Bulk Import | Parse preview, validate/dedup, choose merge, Smart Inbox | Real TXT/CSV test, reversibility, source metadata, unknown Reverso limitations |
| AI Verification | Clear rubric, alternatives and challenge, uncertainty | Test ambiguous answers, event rollback, audit record |
| Smart Review | Real schedule, context and answer evaluation | Tests due-date, lapse, alternate valid answer, no fake knowledge |
| Voice | Actual microphone flow and states, separated ASR/pronunciation | iPhone permission/error verification and disclosure of scorer availability |
| Semantic Network | Validated sense-level edges, interactive filter | Linked sense navigation and provenance |
| Analytics | Defined denominator/source, activity vs skill split | Metric methodology and test/fixture reconciliation |
| Text Extraction | Context-preserving phrase/word lookup | Text selection and polysemy e2e |
| Reader | Legal TXT/EPUB, position, highlight/lookup, My Understanding | Safari selected text test, persist/reopen, copyright controls |
| Smart Cards | Multi-format task engine, accepted alternatives, challenge | Grading fairness cases with evidence |
| Writing | Draft save/revisions, optional AI response and manual improvement | Version diff, distinct style/error, real document ownership |
| Listening | Playback/progress and transcript reveals, independent checks | Listening evidence not confused with reading evidence |
| AI Tutor | Session modes with context and permission, grounded guidance | Provider/fallback verified and trace of contextual recommendation |
| Grammar Atlas | Grammar concept map, exercise/feedback, writing link | Concept-specific evidence and transfer case |

## Horizontal acceptance requirements
- **Knowledge Flow:** at least one cross-module read/write of sense + evidence demonstrated end-to-end; no standalone disconnected silos.
- **Adaptive UI:** quick/full/deep views preserve context, state transitions and manual control.
- **Premium glass UX:** visual regression review at mobile sizes, text always clearly readable, reduced-motion works.
- **Security:** RLS / users can't access another person's documents or progress; no API keys client-side.
- **Performance:** measurements collected on a real/simulated mobile device, caveats documented, animation pressure controlled.
- **Reporting:** `docs/PROGRESS.md` and test results updated after every milestone.
