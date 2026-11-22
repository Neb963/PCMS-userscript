# Active work — handoff

**Current phase:** P18 — Offline synchronization and conflicts. **Status:** Implemented; browser/final interruption review pending.

## Next action

- Verify both-browser sync Jobs/Details, fixed footer, private-source visibility and cancel/focus regressions.
- Review late native receipts when a Stop intent arrives, prepared Import GitHub jobs, unresolved raw write visibility and source-choice interruption boundaries. Fix any discovered gap before accepting P18.
- Accept P18 only after remaining focused checks/CI; then plan P19 FIFO scheduler. Keep all live capability flags false.

## Evidence

- P18 runtime/UI batch: 138 Node tests PASS. Compact sync UI, original-repository labels, comparison-only source text, fixed footer and <=850px Jobs/Details tabs are wired. Follower UI actions use protected confirmed intents consumed by the active Coordinator. Exact comparison hashes/target settings are rechecked; duplicate clicks and simultaneous checks produce one effect. Stop intent inhibits post-Save Listing immediately, before its final local disposition. Browser regressions pending.
- P18 dispositions batch: 133 Node tests PASS. Explicit Reassign preserves original snapshots and creates one successor; unknown old writes and incompatible targets block it. Stop managing retains source/unknown evidence, stops follow-up dispatch, preserves native tabs and refuses unresolved active/lost Development slots. Runtime/compact sync UI and final interruption review remain unfinished.
- P18 source-choice batch: 129 Node tests PASS. Confirmed Publish GitHub version writes a send-once ready request and hands it to the ordinary Utility workflow; the previous approved snapshot/hold survives until native source and Listing are verified. Prepared-but-never-dispatched GitHub actions can resume only with identical intended content. Old-repository dispositions and compact UI/runtime wiring remain unfinished.
- P18 engine batch: 125 Node tests PASS. Original-repository source/status sync, offline eligibility, same-source success, typed conflicts, compare/confirmation races, unknown recheck and unverified-native snapshot rejection are tested. Engine is not yet wired into runtime; source-publication choice, old-repository dispositions and compact UI remain unfinished.
- P18 first verified batch: Import resumes a crash after snapshot but before GitHub preparation; native drift blocks that recovery. Fresh GitHub receipt reconciliation retains superseded state. Focused Import/writer tests pass; sync engine and UI remain to implement.

P00–P17 synthetic implementation evidence is in docs/verification.md. Build/syntax and 109 Node tests PASS. P17 checks 44975374094 and both-browser UI 44975374083 PASS. P01 installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P18 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, retained draft Save and real GitHub synchronization — no disposable profile/targets/PAT supplied. Static capability flags remain false.

**Last pushed commit:** ae390e05ad6da341aa584b67def349c6f1be6632.
