# Active work — handoff

**Current phase:** P18 — Offline synchronization and conflicts. **Status:** In progress.

## Next action

- Implement original-repository sync for verified local source/status, Import recovery and Utility pending statuses; reconcile existing write IDs before any attempt. Freshly recheck previously verified receipts for superseding changes.
- Classify source, request/instruction and account conflicts separately. Only verified approved local source enables confirmed source choices; preserve local Refresher eligibility for sync-only source conflict.
- Add private comparison tokens and revalidate exact compared main/source before Keep approved local or Publish GitHub version. Preserve snapshots/history, no blind Unknown retry or arbitrary account override.
- Implement explicit old-repository reassignment/stop-management dispositions without discarding source. Preserve current same-repository PAT behavior.
- Build compact Jobs / Source & decision UI with fixed footer and Jobs/Details tabs <=850px; safe read-only projections and optional evidence.
- Test offline/restart, same-source success, unrelated main changes, source/request/account conflict, unknown commits, old credentials and comparison races with synthetic adapters. Keep unverified live writes disabled.

## Evidence

- P18 source-choice batch: 129 Node tests PASS. Confirmed Publish GitHub version writes a send-once ready request and hands it to the ordinary Utility workflow; the previous approved snapshot/hold survives until native source and Listing are verified. Prepared-but-never-dispatched GitHub actions can resume only with identical intended content. Old-repository dispositions and compact UI/runtime wiring remain unfinished.
- P18 engine batch: 125 Node tests PASS. Original-repository source/status sync, offline eligibility, same-source success, typed conflicts, compare/confirmation races, unknown recheck and unverified-native snapshot rejection are tested. Engine is not yet wired into runtime; source-publication choice, old-repository dispositions and compact UI remain unfinished.
- P18 first verified batch: Import resumes a crash after snapshot but before GitHub preparation; native drift blocks that recovery. Fresh GitHub receipt reconciliation retains superseded state. Focused Import/writer tests pass; sync engine and UI remain to implement.

P00–P17 synthetic implementation evidence is in docs/verification.md. Build/syntax and 109 Node tests PASS. P17 checks 44975374094 and both-browser UI 44975374083 PASS. P01 installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P18 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, retained draft Save and real GitHub synchronization — no disposable profile/targets/PAT supplied. Static capability flags remain false.

**Last pushed commit:** 0ea31929be38b7c796a50d8fecdddee8ececf3a2.
