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
