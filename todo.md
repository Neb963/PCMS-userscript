# Active work — handoff

**Current phase:** P21 — Refresher screen. **Status:** Planned.

## Next action

- Read/implement the accepted Refresher layout: full FIFO queue left, compact Rate/Recent attempts right; at <=530px use Queue/Rate/Attempts tabs. No simulation controls, extra navigation or outer page scrolling.
- Project only canonical queue/history: Eligible vs Not eligible with reasons/Manage, next eligible/actual next slot and last result, failed/Unknown counted correctly. Unverified worker shows Unknown with queue snapshot, not fake progress.
- Publish a Coordinator-owned clock/rate snapshot on existing heartbeat; followers must not use their own performance clock. Use monotonic pulse observation for clock-change-safe liveness.
- Add local Pause/Resume and integer cap 1–3600, preserve FIFO/history and staged input through rerenders/navigation. Handle Pause during preparation without losing or unnecessarily holding its own marker draft; current already-dispatched Saves may finish.
- Test n=0, changed caps/retained attempts, long queue/history, skipped/failed/Unknown, sign-out/unverified worker, narrow tabs, focus, internal scrolling and both themes. Run focused Node/browser regressions; keep native gates false.

## Evidence

P00–P20 evidence is in docs/verification.md. Build/syntax and 186 Node tests PASS. P20 final UI 44980953769 and checks 44980953760 PASS at 6c453584c640c7eb05bb1eee6b980f3ea55e3a24. Live P01 installation and native qualification remain deferred.

## Blockers / deferred checks

DEFERRED — P01–P20 real Firefox/Violentmonkey injection/cache/disk, native receipt interception/comment parsing/editor cleanup, retained/refresh Save and GitHub synchronization — no disposable profile/targets/PAT supplied. Static write flags remain false.

**Last pushed commit:** 6c453584c640c7eb05bb1eee6b980f3ea55e3a24.
