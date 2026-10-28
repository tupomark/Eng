# Task observations and FSRS

Engineering decision, 23 October 2026. This document describes the implemented local contracts, not a live AI, cloud or pronunciation integration.

## Package and reproducibility

The selected scheduler is **ts-fsrs 5.4.2**, implementing **FSRS-6**, licensed under MIT. The version was checked against the [npm registry](https://registry.npmjs.org/ts-fsrs/5.4.2), and the downloaded package's README, declarations and LICENSE were read. The package has no runtime dependencies, requires Node >=20, and contains 706,415 unpacked bytes; its tarball is 150,324 bytes. These are package sizes, not a measured application bundle budget. The shipped ESM implementation is 61,245 bytes before bundling/compression.

The upstream `main` documentation already describes an incompatible v6 API and FSRS-7. That documentation is not used to infer the installed package's API. The shipped 5.4.2 API used here is `createEmptyCard(now)`, `fsrs(parameters).next(card, now, rating)` and the returned `{card, log}`. No scheduling formula is copied or reimplemented in LEXIS.

`src/domain/scheduling/fsrs.ts` pins `ts-fsrs-5.4.2/fsrs-6/lexis-v1`. Parameters are resolved by this exact library and frozen: desired retention 0.9, maximum interval 36,500 days, fuzz disabled, short-term learning enabled, learning steps 1m/10m, relearning 10m, and the library's 21 default FSRS-6 weights. Every derived schedule exposes all resolved parameters and the complete card, including stability, difficulty, state, counts, learning steps and ISO timestamps. Retention is a scheduling parameter, never a language mastery percentage. Changing the library, model, weights or policy requires a new version and an explicit migration; unsupported versions are rejected without overwriting stored data.

## Identity and review events

A review identity is a stable encoded tuple `(target kind + target ID, skill, prompt family)`. Lexical skills retain the original identifiers `recognition`, `context`, `recall`, `writing`, `speaking`, with additive `listening` and `pronunciation`. Grammar is a distinct concept target with skill `grammar`; it never receives credit from lexical recognition. The legacy learning state remains version 1 and is not silently extended or rewritten.

Formats explicitly sharing one skill and prompt family share scheduling history. An exercise measuring another skill has a separate item. `selectFsrsQueue` caps the queue and buries same-target siblings within a session, so one disclosed answer does not immediately become several independent successes. Queue limits, exclusions, archiving and postponements do not create competence evidence.

User Again/Hard/Good/Easy maps directly to the matching library rating. A deterministic/AI task outcome and a user rating are different actions: the former produces an observation, the latter changes a schedule. Uncertain or unassessed attempts cannot automatically create a linked rating. No AI verdict silently overrides a user's rating. Hints and transcript disclosure remain in the linked rating's provenance.

Review facts are append-only schedule events, separate from task observations. Idempotency checks compare values independently of object property order. Canonical replay sorts by UTC timestamp, then event ID. A manual postponement changes due only, preserving the FSRS memory state. A challenge excludes the associated event and replays all later ratings; its original event and assessment remain in the audit. An exclusion cannot predate its event.

## Task contract and assistance

`src/domain/tasks` defines versioned tasks, exact targets/skills, formats, prompts, accepted alternatives, optional partial answers, rubric, provenance, evaluator capability, hints and source excerpts. Closed exercises accept explicitly authored alternatives after NFC/whitespace/case normalization. Negation, punctuation, accents and words are never stripped as a shortcut to semantic evaluation. Ambiguous prompts abstain. Open writing/speech require their own evaluator; pronunciation requires a specialized scorer. An absent provider preserves the answer as uncertain and creates no negative evidence.

Attempts have answering/submitted/evaluated/cancelled states. Durable answer drafts are UI state, not evidence. Hint/answer/transcript disclosure is recorded before submission. An answer revealed before assessment or an accepted correction creates no independent observation. Transcript-assisted listening remains visibly assisted. These policies apply across Grammar, Review and future Writing/Tutor/Listening workflows.

`TaskCompetenceSummary` is an auditable count, not a calibrated score. `observations` counts deduplicated, non-challenged observations for exactly one target+skill; `accepted`, `partial` and `notYet` count their outcomes, including assisted work. `independentObservations` and `assisted` separately describe help. A UI must not relabel the all-observation accepted count as independent mastery. With no active observations the result is `insufficient-data`, not zero knowledge. Every metric includes methodology `task-observations-v1`.

## Local persistence and migration

`TaskSession`, `BrowserTaskRepository` and `TaskLearningProvider` use the separate versioned key `lexis.tasks.v1`. The repository validates on read/write, checks stale expected bytes, publishes only after a successful write and preserves malformed original bytes. These checks are best effort across tabs, not an atomic database transaction or cloud sync. The React provider uses the existing shared clock and registers its next due deadline; it creates no competing timer.

Legacy FSRS activation is explicit: preview counts and policy → confirm → preserve a complete parsed v1 backup in the new task store → bootstrap recognition self-rating history. Original `lexis.learning.v1` bytes, sense IDs, evidence IDs/disputes, context and Reader position are not changed. Each migrated review retains its original string `legacyEventId`, including non-UUID IDs. No observation is reclassified as objective evidence or transferred to speaking/writing. Identical repeated migration is idempotent; conflicting IDs stop the operation with both original stores intact.

Task exports can be validated and restored through preview, then explicit confirmation. Non-conflicting IDs merge; conflicting task/attempt revisions stop the restore without overwriting either source. A stale preview is rejected. Archiving removes an item from active practice and preserves attempts, observations and review history. Permanent profile deletion and remote account migration remain separate operations requiring the coordinated server/data-lineage path.

After migration, a later legacy challenge immediately excludes its copied FSRS event from the visible derived schedule and is reconciled durably into task storage. Only exclusions for already imported events are synchronized; new legacy ratings are never imported silently. Failed reconciliation keeps the exclusion in the visible calculation and shows an error for retry. An unreadable task store blocks review decisions; unreadable original history pauses imported review until recovery. Restoring an older v1 snapshot does not reactivate an exclusion already recorded in task storage.

## Verification and remaining gates

Targeted tests cover authored regional alternatives, partial/ambiguous answers, skill/concept isolation, assistance, provider absence, duplicate delivery, malformed data, write denial, stale tabs, reload, export/restore, archive, exact library scheduling, lapse, clock/day boundaries, sibling limits, version rejection, canonical replay and challenges after later ratings. Exact commands/counts and the integration SHA are recorded by the parent milestone in PROGRESS; counts in another document are not a fresh run.

The implementation is **implemented-local / contract-tested**. Remote Auth, transactions, two-device sync, objective open-answer AI, live speech, complete Listening integrations and calibrated pronunciation require their actual adapters and verified environments. FSRS scheduling itself runs through the real installed library and needs no external service.
