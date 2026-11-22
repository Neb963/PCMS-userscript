# Active work — handoff

**Current phase:** P19 — Pure FIFO scheduler. **Status:** Implemented; regression checks pending.

## Next action

- Confirm scheduler/coordinator browser regression after one-time clock/FIFO reconciliation, then accept P19 and plan P20 dedicated Refresher Save worker.
- P20 must use the Coordinator clock, dedicated hidden worker, per-generator source lock and exact acknowledged Listed marker Save. It must prevent stale worker effects and never share clocks across document performance origins.

## Evidence

P00–P18 synthetic implementation evidence is in docs/verification.md. Build/syntax and 158 Node tests PASS. P19 covers pure FIFO, capped-to-tail scan, no attempt on selection/skip, rolling account/per-generator caps, failures/Unknown, actual completion spacing, cap/count changes, pause/delay/restart, wall/monotonic jumps, pruning and storage failure. Reconciliation does not write the root on each timer. P18 final checks 44977640186 and Chromium/Firefox UI 44977640270 PASS at a64be5ae0500b6a9c294430e212d39eb513afcee; local/remote trees match. P01 live installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P18 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, retained draft Save and real GitHub synchronization — no disposable profile/targets/PAT supplied. Static capability flags remain false. P19 is a pure/synthetic phase; it does not enable native refresh Saves.

**Last pushed commit:** ffc04eea0b579f3381dee5586a66349019dc7bff.
