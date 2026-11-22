# PCMS 0.1.1 — disabled UI audit candidate

This build supersedes the 0.1.0 visual-inspection candidate after the operator reopened P29. Settings now uses shared intrinsic grid rows with natural card bodies and one overflow owner when needed. The pass also corrects short-screen clipping, enlarged-text layout, state labels, picker cancellation and background-update focus/scroll behavior. See `visual-audit.md` for the complete findings.

Implementation through P30 retains synthetic verification. The production artifact is one deterministic userscript with no backend, companion extension or runtime dependency. The downloadable package supplies the script as `.txt`; rename a copy to `.user.js` for later designated test-profile installation. The simulated UI reference and audit fixtures remain separate from the artifact.

## Verification

- 266 Node tests pass. Build, JavaScript syntax, immutable references and candidate validation pass.
- Complete built-userscript Chromium and Firefox interaction regressions pass after the Settings repair. The final strict scenario sweep and exact CI references are recorded in `visual-audit.md` and `verification.md`.
- Candidate validation checks source/bundle reproducibility, version, metadata, hosts, parseability, absence of known fixture/token/private-key payload and all mutation gates disabled.
- Working artifact and clean committed-tree export agree: 460234 bytes, SHA-256 `c68120cc7956dde8e0e1909ee3d9f768eae57570209adeda3c4f61ec45f935e3`. The source tree was matched to GitHub through the connector; the clean export is local, not an authenticated remote clone.

## Remaining limitation

P31 and further native/operator testing remain paused at the user's request. P01 actual Violentmonkey installation and P31 fresh-profile/live effects are not verified. Synthetic origins and fake services exercise UI behavior without provider effects. Native Save/create/Rename/Listing/Helper and application GitHub writes remain disabled. This candidate does not establish native workflow qualification.

Use `operator-qualification.md` for the remaining evidence when testing resumes. No deferred test is reported as passed.
