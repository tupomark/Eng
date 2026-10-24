# Settings and local profile removal

Implemented locally on 24 October 2026. This is a local browser profile, not account isolation, cloud synchronization or a cloud-account deletion endpoint.

## Preferences

`lexis.preferences.v1` is a strict, versioned store. UI language, explanation language and the task language are separate. EN/RU/mixed navigation/settings are partial localization; imported books, drafts and answers are never translated by changing a preference. Grammar uses the selected EN/RU/mixed explanation default and permits a temporary change without rewriting that default.

Quick, Focused, Free Exploration and Goal Training are persisted preferences. Actual practice behavior and the Goal Training dependency are reported by the practice workspace. Accent and correction intensity are preferences, not evidence of a connected voice/evaluation service. Reading appearance remains in its separate store. Explicit reduced motion applies a document-wide override in addition to the system preference.

Settings writes compare the previous raw value to detect a stale tab. This is a best-effort local guard, not a transactional multi-device repository. Invalid existing bytes remain untouched and can be exported exactly. Restore validates the preference file, shows a preview and requires a separate apply action; it changes no learning history. The first-use panel offers own text, a marked sample and goals without requiring placement. Placement and push reminders are not implemented here.

## Local deletion

`previewLocalProfile()` lists owned local/session records, IndexedDB databases, cache names and the application's exact `/sw.js` registration. Other origin resources are outside the deletion boundary. The action requires `DELETE LOCAL PROFILE` and a separate acknowledgement to export needed stores and close other LEXIS tabs. It does not delete exported files, other browser profiles/devices or server data.

Deletion first stores a durable marker and suspends writes. Mounted workspaces receive a cleanup event; asynchronous cleanup promises are drained before resources are removed. The offline worker must acknowledge a purge stop message before unregistration. Writing aborts active write transactions, closes pending/live IndexedDB handles, clears the mounted editor and blocks late continuations. Other stores use the shared local write guard and their own cleanup.

The marker remains after success until an explicit fresh-start action performs a full navigation. Partial deletion, inaccessible storage, blocked handles, missing worker acknowledgement and non-exhaustive database enumeration retain a blocking marker and a retry path. Browsers without database enumeration require clearing this site's data in browser settings for a fully verified fresh start. A tab cannot inspect another suspended tab's sessionStorage; closing other LEXIS tabs is an explicit prerequisite and scope limitation.

## Evidence and remaining gates

- `vitest run tests/unit/preferences.test.ts tests/unit/local-profile-purge.test.ts`: **31/31 passed** on 24 October 2026, against the working tree based on `23fca53`. These test strict schema handling, stale writes, corrupt bytes, storage failure, confirmation, deletion boundaries, partial retry, durable markers and worker acknowledgement.
- Targeted ESLint passed for settings/preferences, purge, Writing cleanup and Grammar defaults.
- `tests/e2e/settings.spec.ts` contains real browser stories for persistence/mixed Grammar, preserved corrupt export, and confirmed deletion/verification/fresh start. Browser results must be recorded by the integration run; this document does not claim those have passed yet.
- Physical iPhone, multi-device/account isolation, complete localization, hosted deletion and operational retention remain separate gates. Local cleanup tests do not prove them.
