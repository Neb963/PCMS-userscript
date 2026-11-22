# Current-project notes (non-authoritative)

- v1.4 overrides older discovery references to instructions in native src, rank measurements and PersonaMonkey. No companion extension is required.
- Production UI is a closed shadow root; UI tests open it through test-only instrumentation. No production test hook.
- Shell browser launch is restricted; run the synthetic UI suite in Actions. Firefox connector returned Internal error.
- GitHub connector checkpoints and local commits may have different commit IDs; their tree SHAs are checked for equality. Use the remote SHA from `todo.md` when resuming.

- Native appExtras marks Save `saving` before its HTTP request. Only matched own-Save capture permits it; ordinary readiness remains strict. Native worker startup waits for hydration before interpreting session/target state.
- Manual records use `edits`, an independent manual worker role, and edit approval kind. Retained explicit commands keep `slotReleased` so they never consume an automatic Development slot. Read-only capture failures must not add write holds.
- A newer verified approved publication supersedes older unsent source synchronization while retaining full snapshots. Uncertain predecessor writes must reconcile before the newest source/done write.

- Recovery comparisons and source snapshots stay protected. Source readback may resolve an unknown refresh hold, but its counted attempt stays Unknown without a native Save ACK. Source restoration uses Utility and consumes no refresh attempt.
- Stop managing checks canonical Helper state even with an idle worker, archives local identity/holds and retains all snapshots/unknown effects. It never deletes the native generator.

- User requested all workflows enabled for testing after 0.1.1. Use the explicit operator-test build/profile (TEST badge); default inspection stays closed. Build-time authorization is distinct from live proof; retain all existing runtime guards and never mark native acceptance from synthetic runs. Both artifacts keep the same script identity/store keys.
