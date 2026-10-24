# Knowledge Observatory, links and goals

Implemented local scope, 24 October 2026. The three workspaces are `/core/observatory`, `/core/network` and `/goals`. They use existing semantic materials and the current evidence stores. They do not create a scientific brain model, calibrated mastery score, live lexical graph or AI diagnosis.

## Metric definitions

`src/domain/knowledge/observatory.ts` builds an audit trail from original learning v1 observations and shared task observations. Copied legacy FSRS events and schedule ratings are not counted again as task evidence. Equal event delivery is deduplicated by namespaced observation ID; conflicting values for one ID are rejected. Target identity includes sense/concept kind, so grammar evidence never increments a lexical sense.

| Metric                                | Numerator / denominator and exclusions                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-reports                          | Active learning-v1 recognition ratings in the selected window. No objective assessment is inferred.                                                                                                              |
| Independent task observations         | Active task observations with no hints/transcript assistance, for the exact selected skill/target. This counts attempts, not successful mastery.                                                                 |
| Assisted practice                     | Active task observations with recorded help. Revealed answers, accepted corrections and uncertain/provider-failed attempts create no independent observation.                                                    |
| Independent accepted                  | The independently observed subset whose final task outcome is `accepted`. No percentage is calculated.                                                                                                           |
| Independent not-yet                   | The independently observed subset whose final task outcome is `not-yet`. A technical/provider failure is never this outcome.                                                                                     |
| Distinct targets                      | Unique typed target IDs among active observations. This is not a count of mastered words.                                                                                                                        |
| Excluded observations                 | Challenged observations in the window, available only as audit data and excluded from all active calculations.                                                                                                   |
| Saved meanings / identifiable lexemes | All saved sense IDs and the distinct lexeme IDs resolvable by the current editorial dictionary. Unavailable saved senses are counted separately; they are not silently discarded or merged into a random lexeme. |

Methodology version: `observatory-v1`. Date windows are rolling elapsed UTC days ending at the shared clock, with inclusive boundaries. Local dates are presentation only; no local-day streak or timezone claim is inferred. Skills without independent evidence say “not independently measured”, even when self-reports exist. The UI keeps original prompts, answers, context, rubric and source available through progressive disclosure. Challenge calls the existing shared command and immediately changes dependent metrics; original observations remain visible in the excluded audit.

The trail is memoized against source data and filtered by skill/date before paginated display (20 rows per action). Query input does not sort or replay every history again. Search remains browser-local. Full server query plans, large-profile load measurements and field performance remain separate gates.

## Mistake DNA and Knowledge Gaps

A repeated pattern requires at least two distinct independent `not-yet` task observations for one exact target+skill, excluding challenges and help. The view links to relevant practice, labels the number of observations and avoids a permanent learner “type”. One error, a self-rating, missing data, an uncertain answer or a helpful transcript does not establish a weakness. Removing one of two observations removes the repeated pattern. Grammar links use `/grammar?concept=…`; lexical practice links use the real selected-sense practice route.

## Small semantic neighbourhood

`editorial-relations.ts` contains four authored teaching connections within the eight-word, ten-meaning sample. Two distinguish polysemous senses, and two link meanings inside an explicit example. They use `sense-contrast` and `contextual-association`, which have different semantics from synonymy or attested collocation frequency. The model also supports the required ordinary lexical edge types, but the sample does not invent those relationships merely to populate a graph.

Every edge includes stable sense IDs, type, explanation, example, version, rights and editorial/proposal status. A proposed AI edge stays a proposal. The accessible list supports type/source/saved-context filtering and movement between linked meanings; no tiny draggable graph is required. Selection and filter parameters travel in the return URL, and Dictionary uses the constrained return allowlist. Unavailable requested senses have an explicit state and are never silently rebound. Runtime files contain no reference screenshots or wallpaper.

## Goals and declared preferences

`lexis.goals.v1` stores local, validated goals separately from evidence. A goal has a short/long horizon, editable title and subject, optional skill focus, target count, rolling 7/30-day or since-start window, revision, dates and archive status. Subject/domain text is a declared preference, not an inferred topic classification of every observation. Goals are optional and do not lock access to any learning workspace.

Progress methodology `goal-observations-v1` counts distinct active independent task observations after the goal began and within its selected window. The owner chooses all independent assessed attempts or independent accepted outcomes. Hints, transcript assistance, self-ratings, challenges and unassessed answers are excluded. The count measures a practice target, not accomplishment of the whole personal goal. A wrong device clock produces a visible clock issue rather than a fabricated count.

A local optional load suggestion can appear after two independent `not-yet` attempts in that goal's window. It lists the actual count, proposes 75% of the current target (rounded down, minimum one), explains its fixed planning rule and changes nothing until explicit confirmation. A revision guard rejects stale proposals. This is not an AI Tutor capability or an empirically optimal workload prescription. Declining the suggestion retains the current goal.

Repository reads/writes validate version and limits, reject stale bytes and preserve unreadable originals. Goal backups support preview followed by confirmation; identical IDs merge idempotently, while conflicting revisions stop without overwriting either copy. Archiving keeps the goal and all learning evidence. Explicit “remove local goals” deletes this key only, with a named confirmation; broader profile deletion must include this key through the coordinated profile-deletion path. Goal data remains private to the local browser; cloud ownership/sync require the configured server implementation.

## Evidence and limits

The new `tests/unit/knowledge-workspaces.test.ts` passed **12/12** targeted tests: counts/deduplication, exact filters/boundaries, challenge removal, insufficient data, honest goal progress, stale proposal rejection, backup conflicts, typed links, storage quota/stale tabs and corrupt-byte preservation. Targeted ESLint and whole-workspace TypeScript passed after implementation. The three scenarios in `tests/e2e/knowledge-workspaces.spec.ts` are written for root's production-browser run; writing a test is not a claim that it has passed.

Five actual WebP references plus the overview were visually opened, and the original VISUAL_DESIGN/SCREEN_BLUEPRINTS were read before the UI changes. The workspaces keep a quiet text background, warm semantic colours, native labelled controls, shared Modal and readable lists. New production screenshots, actual browser outcomes, 200% zoom/screen-reader/device checks and final visual approval belong to the integrated verification report. Live Auth, cloud sync, broad dictionary/network coverage, provider-validated production observations and physical iPhone checks remain distinct requirements.
