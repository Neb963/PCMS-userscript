# Active work — handoff

**Current phase:** P31 — Release and fresh-profile verification. **Status:** All independent implementation and candidate build verification complete; live release qualification blocked. User authorized sequential end-to-end work.

## Next action

- Complete only the remaining P01 installation and P31 operator-controlled qualification using docs/operator-qualification.md. Do not reimplement P00–P30 or repeat their passed synthetic investigation.
- Require explicitly designated disposable Firefox/Violentmonkey profile, native generators/free slug and target repository with protected credential entry before live mutations. Keep every mutation gate false until matching real evidence exists.
- Candidate bundle/guide/evidence is ready. It is not a qualified operational release. No further independent implementation phase remains.

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

**Last pushed commit:** 0c969b095aeb5cd873efd2cace069dfb03241806. Check actual remote before writes; local/connector commit IDs differ, trees verified equal.
