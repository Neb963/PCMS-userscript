# Active work — handoff

**Current phase:** P20 — Dedicated Refresher Save worker. **Status:** Implemented; regression/final boundary review pending.

## Next action

- Verify final browser regression after fixing Manage action-node replacement and stale snapshot ordering. UI run 44980455714 caught the recurring Include-focus failure; checks 44980455742 passed.
- Final boundary checks: 185 Node tests PASS. Approved native requests validate both panels, exact src manifest and uploaded bytes before transport (including zero-byte mismatch). Request mutation during async guards is rejected. Manage reuses its eligibility node and ignores older snapshots.
- Accept P20 synthetic evidence after checks; then plan P21 full Refresher screen. Native Save qualification remains DEFERRED and statically disabled.

## Evidence

- P20 worker/controller batch: 183 Node tests PASS. Dedicated hidden preparation/Save commands preserve src keys/bytes, confirm only an acknowledged Listed exact marker Save, and retain uncertain drafts. Atomic outcome/attempt/hold/journal writes recover persisted RPC results once. Failures count without GitHub workflow changes; unknown holds only that generator; pre-send skips do not count. Source guards reject independent holds/stale/lost/stopped workers, read-only inspection remains available, takeover retains non-Development roles and preserves Development slots. Runtime is wired with static Save gate false; browser regression pending.

- P20 first verified batch: 164 Node tests PASS. Leading PJS/HTML markers preserve BOM/CRLF/empty panels and exact functional source/src, reject unsafe/malformed/moved/duplicate markers, and support baseline fingerprints at verified Import/publication. Native transport revalidates before dispatch, sends at most one matched request, bounds hung frontend calls and retains observed receipts. Dedicated Refresher preparation/Save/controller wiring remains to implement.

P00–P19 evidence is in docs/verification.md. Build/syntax and 158 Node tests PASS. P19 checks 44978381380 and Chromium/Firefox UI 44978381382 PASS at cb7165381f304dd8e8e023438b917801c5b11cfc. P01 live installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P20 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, retained draft/refresh Save and GitHub synchronization — no disposable profile/targets/PAT supplied. Static write flags remain false.

**Last pushed commit:** cb7165381f304dd8e8e023438b917801c5b11cfc.
