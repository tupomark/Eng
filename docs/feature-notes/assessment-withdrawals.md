# Versioned assessment withdrawals

A question about the location in the original coast recording did not establish understanding of the target lexical meaning of `linger`. It could not justify a positive or negative lexical listening observation. Commit `a665846` replaces that sample with a new task/rubric identity asking about the action heard, with explicit action-meaning choices. The target spelling is not provided in the prompt; transcript disclosure remains assistance.

The versioned application registry in `src/application/assessment-withdrawals.ts` identifies the exact old task/version/rubric. It adds deterministic assessment-policy challenge metadata and excludes linked ratings, preserving original task definitions, attempts, answers and verdicts. Ordinary learner challenges remain compatible. An obsolete objective is archived only if it has no still-valid task format. Later valid events are replayed, not numerically subtracted or erased.

TaskProvider exposes the safe corrected state immediately and persists reconciliation idempotently. A failed local write blocks new scheduling decisions while consumers still receive the safe projection; it does not reinstate the withdrawn estimate. Restored old data passes through the same policy. Source learning v1 is untouched. Listening explains the correction when relevant, and Observatory retains the excluded evidence and its reason.

Four domain/application regressions cover audit preservation, repeated delivery, later valid shared-objective replay, storage failure and retirement of an obsolete objective. `tests/e2e/assessment-withdrawals.spec.ts` builds history through the actual TaskSession and checks the provider, persisted withdrawal, later FSRS state, Core counts and reload. Browser/CI results belong in PROGRESS after execution; test presence is not a successful run.

This is a recorded correction of a known content-assessment defect, not a calibrated listening test, a pronunciation assessment or proof of all future rubric quality. New content must be checked for what the answer actually demonstrates before its outcome can influence a sense/skill.
