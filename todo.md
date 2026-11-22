# Active work — handoff

**Current phase:** P18 — Offline synchronization and conflicts. **Status:** Planned.

## Next action

- Implement original-repository sync for verified local source/status, Import recovery and Utility pending statuses; reconcile existing write IDs before any attempt. Freshly recheck previously verified receipts for superseding changes.
- Classify source, request/instruction and account conflicts separately. Only verified approved local source enables confirmed source choices; preserve local Refresher eligibility for sync-only source conflict.
- Add private comparison tokens and revalidate exact compared main/source before Keep approved local or Publish GitHub version. Preserve snapshots/history, no blind Unknown retry or arbitrary account override.
- Implement explicit old-repository reassignment/stop-management dispositions without discarding source. Preserve current same-repository PAT behavior.
- Build compact Jobs / Source & decision UI with fixed footer and Jobs/Details tabs <=850px; safe read-only projections and optional evidence.
- Test offline/restart, same-source success, unrelated main changes, source/request/account conflict, unknown commits, old credentials and comparison races with synthetic adapters. Keep unverified live writes disabled.

## Evidence

P00–P17 synthetic implementation evidence is in docs/verification.md. Build/syntax and 109 Node tests PASS. P17 checks 44975374094 and both-browser UI 44975374083 PASS. P01 installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P18 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, retained draft Save and real GitHub synchronization — no disposable profile/targets/PAT supplied. Static capability flags remain false.

**Last pushed commit:** ec302f59c95ec4303183caa38c3d4b2d179c7647.
