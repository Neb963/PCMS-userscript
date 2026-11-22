# Active work — handoff

**Current phase:** P29 — Full visual audit and UI remediation (reopened by operator). **Status:** Final browser acceptance pending for corrected 0.1.1 candidate. P31/operator testing paused by user request.

## Next action

- Baseline captured in CI 45054383271 at 312328f1bd78dff41229e70130ca3847bcb45044: 128 captures/browser. Nested short-screen scroll and collapsed Refresher content confirmed; screenshot/measurements retrieved locally.
- Final run: verify complete built-script Chromium/Firefox regressions and strict 216-capture/browser visual sweep after removal of unused empty-notice spacing. Intermediate strict sweep 45056645315 passed both browsers; built Settings fit still exceeded its pane by 2px due to an empty status sibling.
- Audit all main routes, Utility, sync, import, Manage and nested dialogs across setup/empty/loading/error/offline/conflict/unknown/long-content scenarios, both themes, 320px/mobile/tablet/desktop, short height and enlarged text.
- Fix scroll ownership, spacing, wrapping, focus, picker/dialog and state affordance defects; retain accepted routes and native mutation gates. Add assertions for nested scroll chains, not only document overflow.
- Verify screenshots and complete relevant browser regression; push meaningful checkpoints and deliver corrected candidate/report. Do not advance native qualification/P31.

## Evidence

P29: 259 Node tests, build/syntax/bootstrap PASS; Chromium/Firefox UI 45020374414 PASS at 0c969b095aeb5cd873efd2cace069dfb03241806. Includes short height, top-layer picker, nested Escape/Tab, focus on cancellation/pulses and contrast.
P31: Working tree, clean committed-tree export and fresh local clone agree on 453396-byte artifact; SHA-256 4972820441bbab22c3df33b3c56119b294b868705a19f3a51fbc3e4f7fe14554. 266 tests and candidate/build/syntax/bootstrap PASS. Checks 45021550610 and Chromium/Firefox UI 45021550631 PASS at 3e7abe00b45986aa71e7f28158863be1d73ce02e. Native/fresh-profile acceptance DEFERRED.
P30: 266 Node tests, build/syntax/bootstrap PASS. Checks 45021180355 and Chromium/Firefox UI 45021180381 PASS at cb63140f11214ad2ce3764a21305dd53701296d2. Full lifecycle, restart/lost ACK, scoped writer guards, local-priority clearance, current Edit baseline, inventory/managed-rename isolation. See docs/integration-matrix.md.
P28: 258 Node tests, build/syntax/bootstrap PASS; Chromium/Firefox UI 45019557202 PASS at 90c9c00d83f639ff33d900c91fc5cc0097cb605b.
P27: 247 Node tests and build/syntax/bootstrap PASS; Chromium/Firefox UI 45018800781 PASS at 086a4f61ca33c33046501c33ba88c154d6fafd4c.
P26: 241 Node tests, build/syntax/bootstrap PASS; checks 45018104980 and Chromium/Firefox UI 45018104924 PASS at 3e8dc38fd15a7d213c9eb699cf32d5965641188d. Six viewport widths and retained manual-editor guard/cancellation verified synthetically.
P00–P25: docs/verification.md.

## Blockers / deferred checks

DEFERRED — Real Firefox/Violentmonkey install, native Save/Listing/Helper/rename/draft recovery and GitHub writes — no operator-designated disposable profile/targets/PAT; Firefox connector fails, local browser launch restricted. TESTING.md permits independent coding. All live mutation gates remain false. P01 install remains unchecked.

**Last pushed commit:** 349a00596e3686fc728eb2d3b14641d00a057901. Check actual remote before writes; local/connector commit IDs differ, trees verified equal.
