# Verification strategy

The repository has an implemented candidate with synthetic tests. A successful documentation check does **not** establish production userscript behavior.

## Evidence classes

| Class | Test environment | What it proves |
| --- | --- | --- |
| Pure | Node.js synthetic fixtures | Parsing, FIFO math, state transitions, idempotence rules |
| UI | Playwright/Chromium or Firefox automation | Navigation, layout, keyboard, mock adapter rendering |
| Adapter | Controlled Perchance/GitHub fixtures | Readiness, request/response branches, complete source and pending-commit transitions |
| Live | Explicit operator-controlled disposable Perchance generators and Firefox + Violentmonkey | Actual native Save, Listing, Helper, tab, session and restart behavior |

Use synthetic/CI checks first. If live access is unavailable and the current phase permits deferral, record the exact pending scenario and continue coding without claiming a pass. When a phase explicitly demands live proof for enabling real writes, keep that specific write capability disabled in the normal inspection build until checked. A separately labelled operator-test artifact may enable capabilities for explicitly authorized operator testing; it must retain all ordinary guards and cannot be called live-qualified. This is not a blanket project-wide implementation stop.

## Test ownership

- Each phase lists concrete pass criteria in `to-do.md`. Tests must include meaningful failure paths, not only success.
- After changing a module, run tests that exercise that module and its immediate contracts. Run a broader regression before releasing an installable userscript.
- Maintain synthetic fixtures only. Never save browser profiles, tokens, private generator source, session cookies, user account identifiers, or raw diagnostic exports in the public repository.
- UI tests compare the accepted mockup's visible semantics, spacing, fixed scroll ownership, dark/light modes, keyboard handling and 320px reachability. The mockup is not a correctness oracle for remote writes.
- Integration tests simulate delayed/duplicated/out-of-order responses, crash after remote dispatch, GitHub HEAD changes, stale saved source, storage failures, draft mismatches and worker loss.
- Live tests use only explicitly designated disposable generators and never perform destructive actions on production generators without fresh operator authorization.

## CI commands (grow with production code)

- `npm run check:bootstrap` — repo structure, phase plan and immutable reference hashes.
- `npm test` — Node unit/integration tests; domain, adapter and integrated lifecycle fixtures.
- `npm run build` / `npm run check:syntax` — deterministic production bundle and syntax.
- `npm run test:ui` — Chromium; `PCMS_UI_BROWSER=firefox npm run test:ui` — Firefox. Both route to synthetic fixtures.
- `npm run check:candidate` — exact artifact/source match, metadata, version, no fixture/private-key/token payload, disabled qualification gates and SHA-256.
- `npm run build:operator-test` / `npm run check:operator-test` — explicitly enabled testing artifact. CI still uses only synthetic origins/services.
- Real native effects are tested by the operator as described in `docs/operator-qualification.md`; passing synthetic checks does not complete qualification.

## Recording a deferral

In `todo.md`, write: `DEFERRED — <phase/feature> — <precise unrun test> — <reason> — <needed environment>`. Do not check off its test. New agents can proceed to independent phases while retaining the deferred evidence.
