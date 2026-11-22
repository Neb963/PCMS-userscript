# Active work — handoff

**Current phase:** P13 — Generator inventory and Manage. **Status:** Planned.

## Next action

- Build verified-ID inventory with separate Listing/Workflow/GitHub/Refresher states, search/filter/sort and preserved hidden selection.
- Keep filters/footer fixed, list-only scroll and checkbox changes position-stable.
- Add contextual Manage state and validated local Exclude/Include confirmation, preserving independent holds and remote state.
- Test wrong/unknown identity, stable selection, responsive layout and internal scrolling.

## Evidence

- P12 final UI run 44970649444 green in Chromium/Firefox, including verified storage startup. Synthetic run 44970649403 green (52 tests/build/syntax/reference hashes). See `docs/verification.md`.

## Blockers / deferred checks

- DEFERRED — real Firefox/Violentmonkey installation, fresh injection/cache/disk persistence, provider/session/inventory/source/retained-tab checks — no disposable VM profile/targets available.
- All native write capability flags remain false.

**Last pushed commit:** 1862bd9a38c022994d48c72ee0589abaf0811d95.
