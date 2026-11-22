# Active work — handoff

**Current phase:** P17 — Complete approved-source snapshot. **Status:** Planned.

## Next action

- Add a validated approved snapshot containing exact source, native identity, draft/document/tab identity, Listing intent, original repository and pending status, with atomic metadata persistence.
- Add an explicit approval capture/recheck service for retained drafts; fail before Save on changed source, draft, identity, unsettled Helper or failed storage/readback.
- Reuse the same before-Save proof in Utility deployment. Preserve snapshots across restart and storage failures; do not automatically regenerate an approval from changed source.
- Test exact binary/empty file sets, quota/tampering, changed draft/document, missing files and restart readback. P25/P26 will wire the operator approval/edit actions.

## Evidence

P00–P16 synthetic implementation evidence is in docs/verification.md. Build/syntax and 101 Node tests PASS. P16 checks 44974926464 and both-browser UI 44974926515 PASS. P01 installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P17 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, reservation/Save/Listing, retained draft and GitHub writes — no disposable profile/targets/PAT supplied. Static capability flags remain false.

**Last pushed commit:** 52dc6daa903dd7e76b5d07de9da2c9d7b002d8ae.
