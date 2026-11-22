# Active work — handoff

**Current phase:** P16 — Publish from GitHub. **Status:** Planned.

## Next action

- Build exact native draft reader/stager and observed Save receipt adapter; never overwrite an unrelated dirty draft.
- Implement Utility publication from one request revision, persisted full source before Save, exact independent readback, existing Listing preservation and new-only Listing after source verification.
- Checkpoint partial Save → Listing → status; unknown effects recheck without replay. Original-repository status-only done can remain pending offline.
- Integrate automatic durable request claims with serial Utility/import scheduling and truthful Utility job/step screen. Unverified runtime capabilities keep requests waiting before opening workers.
- Verify source deletions, stale/mixed source, offline status, unknown Save/Listing, existing Unlisted, and crash recovery with synthetic adapters.

## Evidence

P00–P15 synthetic implementation evidence is in docs/verification.md. P15 build/syntax, 81 full Node tests plus one new focused guard test pass (82 total). Checks 44974115654 and both-browser UI 44974115645 PASS. P01 installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P16 live Firefox/Violentmonkey injection/cache persistence, native receipt interception, session, inventory, reservation/Save/Listing and GitHub writes — no disposable profile/targets/PAT supplied. Static capability flags remain false.

**Last pushed commit:** 9866bf1f75fce06c4a7057f1acd217f4ace60106.
