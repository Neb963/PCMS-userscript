# Active work — handoff

**Current phase:** P19 — Pure FIFO scheduler. **Status:** Planned.

## Next action

- Implement validated pure rate/FIFO functions: remove ineligible, append newly eligible, one-pass scan, capped-to-tail rotation, selection without an attempt, attempt-to-tail only at Save dispatch.
- Enforce integer cap 1–3600, account/per-generator rolling-hour histories and actual-attempt spacing; failed/Unknown count, known pre-dispatch skips do not. Handle n=0 without fabricated rates.
- Add a conservative monotonic logical clock with persisted wall/restart anchors and startup fence. Delayed timers/suspension never replay slots; backward/forward clock changes never create a burst. Avoid writing the full protected root on every timer tick.
- Persist/read back attempt claims before Save (native worker wiring is P20); preserve FIFO/history on Pause/Resume and cap changes. Bound routine old attempts while retaining rolling-limit and unresolved recovery evidence.
- Verify empty queues, returning eligibility, all-capped one-pass waiting, changing caps/counts, failures, Unknown, skip paths, restart, clock jumps and delayed timers.

## Evidence

P00–P18 synthetic implementation evidence is in docs/verification.md. Build/syntax and 141 Node tests PASS. P18 final checks 44977640186 and Chromium/Firefox UI 44977640270 PASS at a64be5ae0500b6a9c294430e212d39eb513afcee; local/remote trees match. P01 live installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P18 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, retained draft Save and real GitHub synchronization — no disposable profile/targets/PAT supplied. Static capability flags remain false. P19 is a pure/synthetic phase; it does not enable native refresh Saves.

**Last pushed commit:** a64be5ae0500b6a9c294430e212d39eb513afcee.
