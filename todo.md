# Active work — handoff

**Current phase:** P14 — Bulk Import end-to-end. **Status:** Planned.

## Next action

- Verify/discover complete native saved source and target-folder absence; preselect only Ready candidates.
- Process explicit selections sequentially, persist full source/repository before GitHub dispatch, lock manual account at first management and commit source/status atomically.
- Skip conflicts independently, preserve native Listing/drafts and reconcile unknown GitHub results without replay.
- Add fixed preview/results UI and protected coordinator intent queue; keep unverified live write capability disabled.

## Evidence

- P13 UI 44971751107 and synthetic checks 44971751136 PASS; 58 tests. See `docs/verification.md`.

## Blockers / deferred checks

- Real Firefox/Violentmonkey provider/injection/persistence/session/inventory/source/tab and GitHub-write checks are DEFERRED; no disposable live targets/profile/PAT supplied.
- Native write capability flags remain false; normal-use integration effects require their live proof.

**Last pushed commit:** 63d176452ddd73612f690cfa4541583a4e24fda1.
