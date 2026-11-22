# Active work — handoff

**Current phase:** P05 — Single coordinator lifecycle. **Status:** Planned.

## Next action

- Hold one cooperative coordinator Web Lock, increment durable terms and claim operation IDs before dispatch.
- Reject stale/duplicate worker commands and reconcile prior dispatched jobs as Unknown on takeover.
- Test simultaneous candidates, owner loss and worker result fencing.

## Evidence

- P04 synthetic UI passed in Chromium and Firefox at four widths (Actions 44966701167). 15 Node tests/build/syntax pass. See `docs/verification.md`.

## Blockers / deferred checks

- DEFERRED — P01 — actual Firefox/Violentmonkey install/reload/launch — disposable profile unavailable.
- No real native effects enabled; no designated disposable account targets.

**Last pushed commit:** 370dd19f74b6231a45cdb241f1bcdfe796d07e1b.
