# Active work — handoff

**Current phase:** P16 — Publish from GitHub. **Status:** Implemented; browser regression pending.

## Next action

- Verify Chromium/Firefox Utility screen and existing UI regressions; review final P16 source/Listing checkpoints.
- Accept P16 synthetic evidence and plan P17 approved-source snapshot API for retained development/manual drafts.

## Evidence

Build/syntax and 100 Node tests PASS. P16 tests cover exact source/deletions, dirty/switched/missing-file drafts, existing Unlisted preservation, new-only Listing, original-repository offline status, uncertain Save/Listing recovery, stale/reassigned requests and quota failure. Automatic requests are durable and deduplicated; unverified native paths wait without opening workers. P01 installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P16 live Firefox/Violentmonkey injection/cache persistence, native receipt interception, session, inventory, reservation/Save/Listing and GitHub writes — no disposable profile/targets/PAT supplied. Static capability flags remain false.

**Last pushed commit:** 1d323c7c5d2c5b7e0d46e8ea894e0bd5422c9577.
