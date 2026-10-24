# Local Listening Studio and shadowing — 24 October 2026

Scope: an implemented local M12/X05 slice with real playable media, linked to the common task/evidence engine. This is not the full M05 live-voice scope and is not a claim of pronunciation assessment.

## Working implementation

`/listening` plays a real original English sample through a native audio element. The original text was rendered locally with the installed FFmpeg Flite synthesizer; the 3.825-second mono PCM WAV and provenance live in `public/audio/lexis-coast.wav` and `ATTRIBUTION.md`. This is labelled synthetic speech, with software attribution retained. No external API, payment or private content was involved. It is a small authored sample, not a live TTS provider, a human dictionary recording or proof of accent coverage.

The player supports user-gesture play/pause, native seek, speed, A–B repeat, fragment replay and persisted paused position. User-owned WAV/MP3/Ogg/M4A/MP4/WebM uploads require rights/storage consent, bounded size (25 MB, ten files), magic-byte/type/codec checks and actual browser metadata decoding before commit. Blobs, manual transcripts and per-source sessions are private IndexedDB records in `lexis.media.local.v1`. No public file URL is created; object URLs exist only during the mounted visit and are revoked on cleanup. The sample is public original content; imported files are not uploaded, transcribed or evaluated automatically.

Transcript display is hidden/partial/full; disclosure retains a timestamp even after the learner hides it. The sample offers an explicit closed location-choice listening task through `TaskLearningProvider`. Its definition has a real audio-source ID, editorial provenance and listening-only target. A task is unavailable until real playback has progressed. Assistance is copied into the attempt; no recognition/writing/speaking/pronunciation credit is inferred. The chosen answer autosaves through the common task engine; result and Challenge remain connected to Core. Open free-form answers are not falsely graded by a small exact-answer list.

Optional shadowing records a short repeat for local self-playback only. Permission is requested by an explicit action after consent. Capture is capped at 30 seconds/5 MB, released on Stop/Cancel/background/window blur/unmount, and discards a late permission response after cancellation or profile removal. A stale recorder callback cannot stop a newer capture. Visit recordings are not persisted or transmitted and can be deleted immediately. This is self-listening, with no automated transcription or pronunciation grade.

## Persistence and deletion

Playback sessions validate source identity and monotonic revision numbers. IndexedDB readwrite transactions use expected-revision checks rather than last-write-wins; errors keep the current visit input and preserve the previous saved record. The player pauses in the background. Deleting imported media drains/invalidates pending writes and removes its blob, transcript and session in one transaction; separate learning history is retained by the visible policy.

Materials and media subscribe to the coordinated `lexis-local-purge` event and BroadcastChannel. They stop writes/capture/playback, clear private in-memory state and register queued-write cleanup with the purge coordinator. A persistent deletion marker and permanent per-page guard prevent late imports/list results/session loads from repopulating the workspace or reopening a database after deletion; a fresh page is required to resume. Media/session write callbacks check the marker again before adding data, and session commits validate the persisted record before replacing it. The Settings coordinator owns the complete profile-purge result.

## Actual checks and remaining gates

- `vitest run tests/unit/listening.test.ts tests/unit/materials-ingest.test.ts`: **25/25 passed** (six Listening checks plus nineteen material-ingest checks), 24 October. Includes real WAV magic/size, invalid media, playback-vs-seek activity, assistance retention, A–B bounds and common task observation independence/skill isolation.
- Focused ESLint (zero warnings) and full strict `tsc --noEmit` passed on the coordinated working tree based on `23fca53`; final source SHA belongs in the integrated PROGRESS entry.
- Six browser journeys in `tests/e2e/listening.spec.ts` test actual playback/reopen, transcript assistance through shared tasks, private WAV ingestion/error/delete, late-granted capture-resource cleanup, removal while permission is pending and removal while an import's digest is pending. Their final integrated Chromium/WebKit result is recorded by the root engineer; no successful browser run is asserted before execution.
- The microphone test injects a permission result backed by a real browser-created MediaStream track. It verifies cleanup behavior; it does not verify physical microphone permission, iOS lock screen or hardware acoustics.

Status: **implemented-local / contract-tested; integrated browser verification pending**. Remaining M12 scope includes time-aligned transcript import/editing, richer lexical/Grammar links, broader comprehension content, media export/restore as part of the complete profile backup and true multi-device/account isolation. Local sources are useful without ASR or an AI provider, but missing integrations are not called live. iPhone hardware/autoplay/interruption/energy gates remain `awaiting-device-verification`. A browser may evict IndexedDB; the UI tells users to keep their original files.
