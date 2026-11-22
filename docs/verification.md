# Verification ledger

## P00

- Public remote was empty; no open PRs. Scaffold only, operator-only directory excluded.
- `npm run check:bootstrap` PASS: 32 phases and all 11 reference SHA-256 entries.
- `npm test` PASS: 3 bootstrap tests; no runtime feature claimed.
- Remote commit `d33ebffcc51b95fdda0a70104f379acaeb10c742`, tree `a7c73298be69f2de87f960fa970a1ed00202b3d2` matches local index exactly.
- [Actions run 44965967163](https://github.com/Neb963/PCMS-userscript/actions/runs/44965967163) PASS, including clean checkout, both commands.
- References contain public example identifiers only; no operator data was added.

## P01

- `npm run build`, `npm run check:syntax`, `npm test`: PASS (5 tests).
- Deterministic single-file bundle; strict metadata, isolated execution, syntax compilation, named-tab reuse and popup/unavailable paths tested.
- No native write path implemented. Reference mockup is not bundled.
- DEFERRED: actual install/reload/menu launch in Firefox + Violentmonkey; requires disposable browser profile. P01 acceptance remains open for this live check.

## P02

- `npm test` PASS (9 tests), build and syntax PASS.
- Canonical status states/actions; manual account binding; ID/slug/Listing; independently keyed holds; original-repository pending updates; exact binary source validation.
- Negative paths cover duplicate/missing status, invented states, unsafe paths, incomplete panels, malformed bytes and one-hold resolution retaining another.

## P03

- `npm test` PASS (14 tests), build and syntax PASS.
- Single protected root with schema validation, Web-Lock transaction serialization and exact write/readback.
- Restart retains complete binary source, original repository and all independent holds; dispatched actions become Unknown without automatic replay.
- Quota errors, mismatching readback, unavailable lock and unsupported schema fail without resetting stored work.

## P04

- Build, syntax, bootstrap, 15 Node tests PASS.
- [Actions 44966701167](https://github.com/Neb963/PCMS-userscript/actions/runs/44966701167): Chromium and Firefox UI steps PASS at 1440/1024/530/320px; four tabs, Settings/subviews, Enter activation, persisted theme, shared header bounds, no outer overflow, preserved underlying native fixture.
- Closed production shadow root, native dialogs and app-styled keyboard picker. No sample data or remote success substituted.
- Separate path-scoped UI workflow avoids browser runs for unrelated pure-module changes.
- Actual Violentmonkey installation remains P01 deferred; UI evidence uses controlled synthetic pages.

## P05

- Build/syntax and 17 Node tests PASS. P04 follow-up [UI run 44966839223](https://github.com/Neb963/PCMS-userscript/actions/runs/44966839223) PASS.
- Runtime holds one coordinator Web Lock, increments protected terms and persists job claim/dispatch/acceptance before effects.
- Tests exercise simultaneous candidates, owner loss, durable Unknown takeover, duplicate dispatch/delivery, wrong document and rejected late result. Same-generator unresolved work prevents another dispatch; unrelated jobs remain possible.

## P06

- Build/syntax and 22 Node tests PASS.
- Privileged GM store/listener inbox/outbox, canonical saved commands and per-document acceptance. Managed workers are coordinator candidates.
- Background-only tab creation, role capacity, retained-tab activation fallback, hidden-worker roundtrip, duplicate pump, selected-tab protection and lost-worker isolation tested.
- Native capability handler intentionally rejects unavailable actions. Actual tab/window activation in Violentmonkey remains DEFERRED until the disposable-profile test; no draft is replaced to simulate activation.

## P07

- Build/syntax and 25 Node tests PASS.
- Manual binding and explicit confirmation, opaque session-change detection, independent owner read and exact editor ID/slug/draft readiness.
- Tests reject signed-out/changed sessions, wrong ownership and target, pending draft choice and locked account changes. Account ID is never derived from native user data.
- Native write capability flags remain false; no UI setting can bypass them. Live owner/session verification remains DEFERRED with the Firefox/Violentmonkey disposable-profile checks.

## P08

- Build/syntax and 31 Node tests PASS.
- Independent native inventory/owner/metadata reads and complete saved PJS/HTML/manifest-byte retrieval, with metadata coherence checked before/after all files.
- Tests cover empty src, missing panels/manifest/file, corrupted byte length, wrong ID, concurrent Save, rename and absent inventory. No absence is treated as deletion.
- Privileged HTTP restricts HTTPS hosts and credential target; bytes and challenge/redirect responses validated. Native reads require live disposable-profile confirmation before operational claims.

### P03/P06 compatibility correction

- Checked [Violentmonkey privileged API](https://violentmonkey.github.io/api/gm/): removed unsupported GM_getTab/GM_saveTab and setParent option; use documented GM.getValue/GM.setValue promises.
- Worker URL/name contains only a non-secret worker reference. Protected root assignment/document/term remains the authority; a reload cannot blindly re-execute a command.
- Build/syntax and 32 tests PASS; production API allowlist regression added. Prior P08 UI run 44967606581 pending at this checkpoint.

## P09

- Build/syntax and 37 Node tests PASS.
- Exact repository URL validation; one main commit/tree with content-addressed blobs checked by Git blob SHA/byte length; complete source and manual-account status selection.
- Request identity uses status path history and instruction blob IDs. Closed stale ready/instruction edits cannot replay; a new ready needs explicit transition evidence.
- Tests cover lookalike URLs, missing/corrupt source, truncated trees, changed repository, account mismatch, stale instructions, offline preservation and Check now without schedule reset.
- Runtime polls only configured repositories; outage leaves prior records and independent FIFO untouched.

## P10

- Build/syntax and 40 Node tests PASS.
- Complete source/status commits use Git Data API, preserve unrelated files/instructions, remove obsolete src and always update main without force after checking HEAD.
- Persisted operation intent, object/commit/ref stages and protected global commit lock. Uncertain results require history/tree reconciliation; no blind second commit/ref dispatch.
- Tests cover atomic source/deletion, separate status writes, changed generator baseline, HEAD race and landed ref with lost response. No configured live repository was written for tests.

## P11

- Build/syntax and 43 Node tests PASS at UI checkpoint; targeted session/settings regression now 7 PASS (44 total next full run).
- [UI run 44968484461](https://github.com/Neb963/PCMS-userscript/actions/runs/44968484461): Chromium and Firefox steps PASS at four widths, including account/repository drafts across navigation, credential absence from DOM and invalid polling preserving applied settings.
- Settings Test→Apply invalidation, pending-work confirmation and original repository credential retention verified. Native credential dialog keeps PAT outside page input; main Settings shows only masking.
- Fixed server session-token rejection to invalidate confirmation even if native page login flag is stale.

### P03/P05/P06 cache-coherence repair during P12

- Provider source shows `GM.getValue` uses a document-local cache. Original cached root read/modify/write was insufficient for concurrent tabs.
- Added one Coordinator writer, protected checkpoint/CAS messaging and fresh-injection startup read. No ordinary frame can start PCMS or native operations.
- Build/syntax and 50 Node tests PASS. New tests deliberately give a follower a stale cache and verify retained approved source, both independent updates, fresh takeover and fail-closed persistence failure.
- Original P12 [UI run 44968961811](https://github.com/Neb963/PCMS-userscript/actions/runs/44968961811) PASS. Updated startup/iframe path needs the next synthetic UI run; actual VM cache/injection persistence remains DEFERRED.

- Cache-repair UI run 44969857009: Chromium PASS; all Firefox behavior assertions passed, but Firefox reported protocol evaluation cancellation when the successful transient probe removed its own document. Fixed test injection to execute from the frame's DOMContentLoaded handler; successful probe now explicitly requires a verified Coordinator and removal of the transient frame. No behavior assertion was removed.

- UI run 44970004436: Chromium PASS; Firefox startup waited for verified authority rather than accepting a cached shell. Fixed the probe lifecycle to resolve its protected reply before removing the child document on a parent task. Added ordering regression and startup diagnostics containing synthetic status only. Read-only header check confirms Perchance welcome currently uses `X-Frame-Options: SAMEORIGIN`; real VM injection remains deferred.

- UI run 44970210617: Firefox did not establish authority; diagnostics showed Unverified after probe removal, with no page exception. The fixture now registers injection before reading a potentially not-yet-final child URL, and records synthetic startup stage metadata. Failed authority acquisition marks storage unavailable; an unverified case set can no longer show No action required. Coordinator bootstrap-failure cleanup regression added (52 total tests PASS).

- Firefox fixture trace in 44970465169 identified init-script execution before the child URL became available (empty URL, no probe injection). The test now injects on actual frame navigation and accepts protocol teardown only when the exact nonce has a protected GM reply, authority is Verified, and the probe frame is removed. All production/page-error assertions remain active.

### P12 final verification

- [UI run 44970649444](https://github.com/Neb963/PCMS-userscript/actions/runs/44970649444) PASS in Chromium and Firefox, four widths, including verified authority, exact protected probe nonce, probe removal, history details/focus and preserved settings drafts.
- [Synthetic run 44970649403](https://github.com/Neb963/PCMS-userscript/actions/runs/44970649403) PASS (52 tests, build, syntax, reference hashes).
- The earlier Firefox failures were synthetic injection/lifecycle timing defects; receipt-based assertions remain active. Actual VM provider persistence/injection is still deferred and native writes stay disabled.

## P13 verification in progress

- 57 Node tests, build and syntax PASS.
- UI run 44971376854 reached the separate unbound setup case; its new locator matched both the Settings icon and the valid Overview recovery link. Scoped the test to the accepted top-right icon's accessible label; no UI behavior/assertion removed.

- Added P13 positive nested-confirmation coverage: local Exclude retains Listing, workflow and both independent holds, keeps Manage open and restores focus to the updated Include action. Authority reads now wait for in-flight persistence, preventing a storage callback from rendering a half-committed state. Targeted ordering regression passes; 58 total Node tests/build/syntax PASS.

### P13 final verification

- [UI run 44971751107](https://github.com/Neb963/PCMS-userscript/actions/runs/44971751107) PASS in Chromium/Firefox at four widths, plus separate unbound setup. Selection/scroll, hidden selections, Manage, nested confirmation and focus, locked IDs, original Listing/workflow/holds and existing regressions verified.
- [Synthetic run 44971751136](https://github.com/Neb963/PCMS-userscript/actions/runs/44971751136) PASS (58 tests/build/syntax/hashes). Remote and local tree hashes match.

## P14 verification

- Build/syntax and 67 Node tests PASS. Complete source/status import, folder-conflict isolation, Listed/Unlisted preservation, durable unknown-commit reconciliation, late local reporting and source drift tested.
- Import preview is bound to its tested repository; queue rejects changed settings. Missing binary payload cannot be mistaken for a zero-byte saved file. Cancelling preview stops further read work without cancelling an explicit queued Import.
- Runtime coordinator owns sequential import commands and guarded GitHub writes. Integration write proof remains false; no real VM/PAT/provider operation is claimed.

## P14 — Bulk Import

67 Node tests, build and syntax pass. Synthetic UI run 44973566403 (Chromium and Firefox) and checks 44973566397 pass at remote 2271908424ab290c6be515515408fe6585993393. Import preselection, folder skips, exact source/deletions, retained snapshots, original repository, uncertain commit and post-commit source drift are covered. The delayed Manage inspection race preserves both current exclusion state and keyboard focus. Live VM/private GitHub/native inventory evidence remains DEFERRED; write gates remain closed.

## P15 — Reservation

Build/syntax and 81 Node tests pass. SlugReader uses exact normalized visible messages and independent saved identity; HTTP codes/iframe shells do not establish availability. Reservation checkpoints create before dispatch, retains native ID before Unlisting/Rename, rechecks availability, verifies owner/ID/slug and queues original-repository reserved/blocked writes. Lost create is never replayed; same-ID landed Rename reconciles without a second request. New native receipt observer watches the matched native fetch response and excludes credentials/source/arbitrary response data. Utility navigation requires a hidden clean original document, unexpired current-term intent and new document registration. A request factory and protected worker handlers are bundled; automatic request scheduling is P16. Native capability flags remain false; Firefox exportFunction/native endpoints and disposable reservation are DEFERRED.

P15 remote 9866bf1f75fce06c4a7057f1acd217f4ace60106: synthetic checks 44974115654 and Chromium/Firefox UI 44974115645 PASS. Additional same-slug unresolved-creation guard has a focused passing inverse test (82 total Node tests).
