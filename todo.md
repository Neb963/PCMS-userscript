# Active work — handoff

**Current phase:** P13 — Generator inventory and Manage. **Status:** Implemented; browser verification pending.

## Next action

- Verify four-width inventory tests: stable checkbox/list scroll, hidden selection, locked account, Manage close/focus and existing Settings/history regressions.
- Verify separate unbound setup form still preserves staged account ID.
- Then implement P14 complete saved-source Bulk Import with conflict-safe independent outcomes.

## Evidence

- Build/syntax and 57 Node tests pass.
- Inventory is keyed by verified native ID; separate four-state projection; pure filters/sorts; keyed row updates preserve checkbox focus and list position.
- Manage shows only applicable implemented actions. Bulk Exclude/Include rechecks each selected ID, changes local eligibility only and preserves independent holds/source/Listing.
- Unknown/renamed IDs are retained; unexpected Unlisting adds its own hold. No native operation was simulated as success.

## Blockers / deferred checks

- Real Firefox/Violentmonkey provider/injection/persistence/session/inventory/source/tab checks remain DEFERRED; no disposable live targets/profile available.
- Native write capability flags remain false.

**Last pushed commit:** 4b2185174f7a1b735d63e9f393cf48a6be6057d9.
