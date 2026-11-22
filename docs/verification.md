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
