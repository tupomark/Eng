# CI checkpoint — 25 October 2026

This is an exact-source verification record, not a claim of full product completion. Later working-tree changes require their own checks.

## Published source and environment

- Repository: `tupomark/Eng`, branch `codex/product-completion-v2`, [draft PR #1](https://github.com/tupomark/Eng/pull/1).
- Checked source: `4490472302f4909fb00f80ae3ce2944a36c45ecd`.
- [Actions run 40184308189](https://github.com/tupomark/Eng/actions/runs/40184308189), [job 121141745797](https://github.com/tupomark/Eng/actions/runs/40184308189/job/121141745797): 25 October 2026, 10:19:45–10:25:51 UTC, **failure**.
- GitHub-hosted `ubuntu-latest`, Node 24, two Playwright workers, actual Chromium and WebKit. Browser dependencies were installed by `playwright install --with-deps chromium webkit`.
- Duplicate push run `40184303818` was cancelled by the workflow concurrency policy when the PR run started. That cancellation is separate from the failing browser assertion.

## Actual results

| Gate                            | Result at this SHA                                 |
| ------------------------------- | -------------------------------------------------- |
| `npm ci`                        | Passed                                             |
| `npm run format:check`          | Passed                                             |
| `npm run lint`                  | Passed                                             |
| `npm run typecheck`             | Passed                                             |
| `npm test`                      | **288 passed**, 27 suites, 6.48 seconds            |
| `npm run build`                 | Passed                                             |
| Playwright browser installation | Passed                                             |
| `npm run test:e2e`              | **123 passed, one failed**, 124 cases, 4.1 minutes |

No case was reported as a flaky pass in this run. The single failing case failed both its first attempt and its one configured retry. This result does not inherit the older successful run on `d68d431`, which had 123 passed and one flaky pass.

## Reproduced test race and minimal correction

The failure was the WebKit case in `tests/e2e/sense-contexts.spec.ts`, “two source contexts for one meaning persist/search/export/restore without changing existing learning bytes.” It timed out waiting for the second passage, `We linger by the quiet river.`

The actual failure screenshot, accessible snapshot and browser trace were downloaded from [artifact 12596245179](https://github.com/tupomark/Eng/actions/runs/40184308189/artifacts/12596245179) and inspected. The screenshot and accessible snapshot show the import page. The trace records this sequence:

1. Open `/library/import`, preview and save the two-paragraph fixture.
2. Click `Continue reading`, select the first passage and successfully save its meaning.
3. Navigate to **`http://127.0.0.1:3000/library/import`**, then wait for the second Reader passage.

The test captured `page.url()` immediately after the client-side `Link` click, before the Reader navigation committed. Its subsequent `goto(reader)` therefore returned to the import form. This is direct evidence of an incorrect test destination; it does not demonstrate lost source data.

The minimal correction waits for the concrete `/reader/<document-id>` URL before saving the return destination. It does not add retries, increase timeouts or suppress the failure. Targeted Prettier and ESLint checks passed on this test edit. Browser verification of the correction and the new catalog slice is performed by the main integration run and must be recorded separately with its actual source and result.

## Limits

These are local/domain/database-stub and hosted CI browser results. They do not verify hosted Supabase Auth/JWT/storage isolation, two-device synchronization, live AI or speech providers, dictionary licensing, physical iPhone Safari, standalone PWA behavior, deployment or operational restore. A passing build or browser suite does not close those independent gates.
