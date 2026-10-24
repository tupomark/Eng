# Local materials, imports and private reading — 23 October 2026

This is an implementation note for S3/M02/M08/M09, not a second product specification. The full v2 owner contract remains authoritative.

## Working local behavior

- `/library/import`: file/paste preview, explicit rights/storage confirmation, TXT/DRM-free EPUB reading imports and TXT/CSV/XLSX vocabulary imports. No upload or AI request occurs. Text encoding is selectable; CSV supports BOM, escaped quotes, quoted newlines, comma/semicolon/tab, supplied Reverso-style headers and mixed English/Russian.
- `/library/inbox`: paged search/filter, individual/bulk accept/defer/reject, row repair, unresolved meanings, explicit choice from the editorial dictionary where available, and an explicit subsequent save-to-study action. Importing/accepting does not create learning evidence or automatically schedule every row. Rollback removes Inbox participation and preserves independent saved meanings/practice history.
- `/reader/[documentId]`: private imported chapters, contents, bounded document search, structural document/version/chapter/paragraph/character anchors, persistent bookmarks, reload/return and shared Reader appearance options. Text remains native/selectable. Tap lookup and phrase selection open Dictionary with a bounded tab-local excerpt and a return address; private excerpts are not put in URLs. Rendering is paged at 80 paragraphs rather than constructing every chapter simultaneously.
- `MaterialLibrary`: document counts/search, rename/archive/unarchive, explicitly confirmed document deletion, materials JSON export and validated additive restore preview. Original unreadable bytes can be downloaded without modification. Learning v1 remains separate and unchanged. Deleting a document also removes its temporary Dictionary excerpts; previously saved learning excerpts remain by the displayed policy and are managed separately in Core.

## Safety and persistence

`lexis.materials.v1` is an isolated local-only store (`owner: local`) with runtime validation, revision numbers and a stale-tab serialized-state guard. A failed read blocks writes; invalid bytes are not reset. A failed write does not publish a successful state. The guard is best effort, not an atomic cross-tab database transaction. Restore is additive, keeps an existing document's reading position, and stops on conflicting import IDs rather than overwriting them. Stable local content identifiers include collision checks; they are not security identifiers.

Archive input is bounded before inflation: 10 MB input, 20 MB expanded, 2 MB per entry, 500 entries, supported compression only, no encryption/ZIP64/multidisk layout, safe canonical paths, nonoverlapping ranges and CRC integrity checks. Inflation is chunked with actual-output limits and cancellation points. EPUB XML rejects DTD/entity declarations; scripts, forms, active media and links are excluded and content is rendered only as React text. EPUB encryption metadata causes a supported-format error; no DRM circumvention is attempted. XLSX reads plain values from its first worksheet, skips formulas and rejects macro/external-connection files. Nothing invokes worksheet formulas, remote links or document instructions.

Vocabulary limits are shown before import: 5 MB, 10,000 rows, 32 columns and 10,000 characters per field. Parsing/normalization yield in chunks, expose progress and can be cancelled before committing a batch. Exact candidate duplicates retain their rows and source data for user decisions; differing POS/translation/context/source are not silently merged.

Dependencies added centrally by the root engineer: `fflate@0.8.3` and `fast-xml-parser@5.11.2`, both MIT. Their published npm metadata and official README/API were checked. No Excel engine, EPUB iframe, WebGL or editor SDK was added.

## Verification and remaining scope

- `vitest run tests/unit/materials-ingest.test.ts`: **19/19 passed**, including 1,001 rows, cooperative cancellation, quoted mixed-language CSV, supplied Reverso table, EPUB/XLSX ZIP parsing, script exclusion, unsafe paths, decompression limits, malformed archives/entities, formula handling, storage failure, corruption preservation, additive restore and temporary-context removal.
- Focused ESLint over these source files/routes/tests: passed with no warnings. Full repository strict `tsc --noEmit` passed after the coordinated server-test type fix.
- Four browser journeys are implemented in `tests/e2e/materials-journeys.spec.ts`; root runs them against the integrated production build. No browser success is claimed here before that run. Real original TXT/CSV/TSV/EPUB/XLSX fixtures live in `tests/fixtures/materials/`.
- Before UI work, this implementer visually opened the curated mobile family and the overview; written minimalism/readability priorities governed the UI. The final application screenshots and physical iPhone gesture/selection tests remain separate gates.

This feature is **implemented-local/contract-tested**, with browser verification pending. It is not cloud storage, account isolation, two-device synchronization or guaranteed offline retention. The wide licensed dictionary, TTS, My Understanding evaluator, AI contextual Tutor and real-device Safari remain external/adjacent work. EPUB renders readable text only (no original image/layout reproduction). XLSX currently reads the first worksheet only. Resumable server jobs, row merge/split beyond explicit meaning choice, cross-batch semantic deduplication and linked multi-source learning contexts are not claimed complete. The full v2 M02/M09 acceptance remains partial until those scopes and live gates are closed.
