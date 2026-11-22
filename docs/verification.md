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
