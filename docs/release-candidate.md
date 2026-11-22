# PCMS 0.1.0 — disabled candidate

Implementation through P30 has synthetic verification. This build includes import/reservation/publication, send-once Helper development and review/cancellation, protected Manual Edit, offline original-repository synchronization, pure-FIFO Refresher, atomic Rename, complete-source Rollback and contextual recovery.

The production artifact is one deterministic userscript with no backend, companion extension or runtime package dependency. The accepted UI reference remains separate. The downloadable package supplies the script as `.txt`; rename a copy to `.user.js` only in the designated test environment.

## Verification

- 266 Node tests pass, including production GitHubReader/Writer against an immutable synthetic Git Data provider through full Listed/Unlisted lifecycles and restart/lost-response reconciliation.
- Build, syntax and immutable-reference checks pass.
- Chromium and Firefox synthetic UI pass at six widths plus empty setup and short-height/reduced-motion interaction checks.
- Candidate validation checks exact source/bundle reproducibility, version, metadata, expected hosts, JavaScript parseability, no known fixture/token/private-key payload and all mutation gates disabled.

See `verification.md` and `integration-matrix.md` for exact commits/run IDs and limits. Clean exported-source build/hash evidence is recorded there when packaging finishes.

## Remaining limitation

P01 actual Violentmonkey installation and P31 fresh-profile/live effects are not verified. No designated disposable browser profile, targets or protected test credential were supplied. The browser connector failed and local browser launch is restricted; CI browsers use synthetic origins only. Consequently native Save/create/Rename/Listing/Helper and application GitHub writes remain disabled. This candidate is for inspection and controlled qualification, and will not operate those workflows on a real account.

Use `operator-qualification.md` for the exact remaining evidence. No existing test is reported as native/live success.
