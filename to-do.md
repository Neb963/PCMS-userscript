# Implementation plan — numbered phases

**Product authority:** `references/PCMS-authoritative-specification-v1.4.md`. **Perchance mechanics:** `references/perchance-discovery.md`. **Visual reference:** simulated v2.0.0 mockup. This plan sequences implementation; it cannot change those decisions.

## Phase rules

- Work on **one** numbered phase at a time; read its tasks and success check before starting.
- Mark a checkbox only after implementation plus appropriate test evidence. Use `todo.md` as the short, continuously updated execution log.
- If a live test is unavailable and `TESTING.md` permits deferral, record `DEFERRED` and proceed to independent coding. Do not mark it passed or enable unverified real writes.
- Update both trackers, commit, and push before handing off. Do not replace a missing test with an unsupported success claim.
- Each phase is deliberately narrow; do not combine adjacent phases just to check off more boxes.

## Phases

### P00 — Repository bootstrap and CI

- [x] Check initial tree, README, reference SHA-256 manifest, and no secrets.
- [x] Run bootstrap checks locally and in GitHub Actions.
- [x] Commit/push initial scaffold to `main`; ensure a fresh clone passes.
- [x] **Accept:** A fresh clone runs the two bootstrap commands; CI green; no runtime feature claimed.

### P01 — Build a real installable userscript

- [x] Create the production `src/entry.user.js` and a simple deterministic single-file build.
- [x] Make the initial userscript load on Perchance without changing native behavior or opening duplicate PCMS tabs.
- [x] Add metadata, syntax and build-output smoke tests.
- [ ] **Accept:** One generated `.user.js` installs in Violentmonkey; source and reference mockup remain separate.

### P02 — Define the minimum domain records

- [x] Model account config, generator native ID/slug, Listing, workflow, local holds and pending updates.
- [x] Keep `status.md` exactly three required fields with no new state.
- [x] Add validation for invalid IDs, unknown state and multiple independent holds.
- [x] **Accept:** Synthetic tests demonstrate one canonical meaning per state and reject malformed inputs.

### P03 — Durable local store and recovery records

- [x] Implement one userscript-controlled store for settings, FIFO, attempts, holds and pending source.
- [x] Persist before remote dispatch and read back accepted source snapshots before Save.
- [x] Test restart rehydration, storage failure and preservation of unresolved records.
- [x] **Accept:** Simulated restart retains pending snapshots and holds; failure never creates false completion.

### P04 — Accepted PCMS shell and navigation

- [x] Implement the dedicated UI tab, Overview default, four top tabs, Settings icon and theme.
- [x] Use shared headings, accessibility primitives and internal scrolling.
- [x] Add navigation/keyboard smoke tests at wide, medium and narrow widths.
- [x] **Accept:** The mockup remains a visual reference; no faux remote success appears in the UI.

### P05 — Single coordinator lifecycle

- [x] Implement one cooperative Web-Lock coordinator role and saved term/job claims.
- [x] Reject duplicate and stale worker commands and rehydrate without double-dispatch.
- [x] Test simultaneous candidates, loss of coordinator and uncertain in-flight job.
- [x] **Accept:** Exactly one active simulated coordinator dispatches; old commands cannot re-dispatch jobs.

### P06 — Worker tabs and communication

- [x] Implement coordinator messaging and worker roles: Refresher, Utility, Development.
- [x] Keep Refresher dedicated, Utility sequential and two active Development slots.
- [x] Test worker loss, operator-selected tab protection and explicit tab activation.
- [x] **Accept:** Synthetic tab events preserve task isolation; no automatic focus stealing.

### P07 — Perchance session and ownership checks

- [x] Implement sign-in state and **manual** `account_id` / Confirm session; never infer account ID.
- [x] Read owner/ID/slug readiness from the documented native surfaces.
- [x] Test sign-out, invalid session, mismatch and owner-only action blocking.
- [x] **Accept:** Native writes remain disabled until required operator/session/target conditions are met.

### P08 — Perchance inventory and saved-source reader

- [x] Read inventory and generator ID/slug/listing independently of UI cache.
- [x] Read complete PJS, HTML, exact `src/` path-and-byte set.
- [x] Test empty `src/`, rename, disappearing slug, missing file and corrupted readback.
- [x] **Accept:** Saved-source comparison is exact and does not treat absent reads as deletion.

### P09 — GitHub reader and status parser

- [x] Validate repository URL and fetch one coherent `main` snapshot.
- [x] Parse three required `status.md` fields; select only requests assigned to manual `account_id`.
- [x] Handle changed repository, missing source, stale/invalid request and GitHub offline.
- [x] **Accept:** Synthetic GitHub fixtures reject malformed requests and never mix revisions.

### P10 — GitHub complete-source commit writer

- [x] Implement source/`src/` deletion commits and separate status-only writes.
- [x] Detect changed HEAD/incompatible generator revisions before committing.
- [x] Reconcile lost commit response without blind repeat.
- [x] **Accept:** Tests prove complete-tree updates and conflict-safe behavior with concurrent changes.

### P11 — Settings UI and safe configuration

- [x] Implement Account, GitHub Test → Apply, poll interval, theme and compact System.
- [x] Keep real credentials in isolated userscript-controlled context, not page or exports.
- [x] Test staged edits, invalid candidate, repository/PAT switch confirmation and sign-out UI.
- [x] **Accept:** Uncommitted input survives rerender; invalid settings preserve working config.

### P12 — Overview action cases, operations and journal

- [x] Project verified unresolved cases and their canonical recovery links.
- [x] Project four workers and Unknown/offline states without invented progress.
- [x] Keep one event journal; implement 3-event summary, search, details and safe export.
- [x] **Accept:** No bell, notification store or duplicated diagnostics; cases are not cleared by navigation.

### P13 — Generator inventory and Manage

- [x] Implement list/table, filter/search/sort, stable selection and per-generator state columns.
- [x] Implement contextual Manage drawer and action validation.
- [x] Test preserved selection, internal scrolling, wrong-owner and unknown states.
- [x] **Accept:** One verified native ID maps to one row; no selection operation mutates remote state.

### P14 — Bulk Import end-to-end

- [x] Preselect eligible native generators; validate source and GitHub-folder absence.
- [x] Commit complete saved source plus `publish_from_github / done` without native Save.
- [x] Report per-generator outcomes and reconcile uncertain GitHub commits.
- [x] **Accept:** Imported source equals native saved source; conflicts skip without blocking other rows.

### P15 — Slug reservation in Utility

- [x] Classify Available/Taken/Reserved/Unknown; reuse owned generator.
- [x] Create when appropriate, set Unlisted, rename exact slug, verify same ID and owner.
- [x] Persist temporary generator and `reserved`/`blocked` outcomes without silent retry.
- [x] **Accept:** Failures stop only the affected request; no duplicate generator creation on unknown result.

### P16 — Publish from GitHub workflow

- [x] Resume `ready`/`reserved` safely; stage full same-revision GitHub source.
- [x] Use native Save/readback, preserve existing Listing, List only newly created generator after Save.
- [x] Write/queue status-only `done`; recover partial Save→Listing→status sequence.
- [x] **Accept:** Native source and intended Listing verified; no partial or stale source publication.

### P17 — Complete approved-source snapshot

- [x] Capture approved PJS/HTML/exact `src/`, identity, intended Listing and original repository.
- [x] Persist and read back snapshot before invoking any approved Save.
- [x] Test quota/failure, restart, modified draft and missing file.
- [x] **Accept:** No approved Save begins without a confirmed recoverable snapshot.

### P18 — Offline synchronization and conflicts

- [x] Record locally done/source verified while GitHub unavailable; bind original repository.
- [x] Reconcile pending commits, same-source success, unknown commits and incompatible changes.
- [x] Expose Compare/Keep local/Publish GitHub choices without losing local snapshot.
- [x] **Accept:** One GitHub failure does not stop locally verified eligible Refresher work.

### P19 — Pure FIFO scheduler

- [x] Implement one-pass queue scan, capped-to-tail rotation and newly-eligible-to-tail.
- [x] Enforce spaced attempts, account/per-generator rolling 60-minute limits.
- [x] Test n=0, cap changes, failures, unknown attempts, clock jumps and missed slots.
- [x] **Accept:** Pure scheduler never spins or catches up, and skips do not spend an attempt.

### P20 — Dedicated Refresher Save worker

- [x] Implement inert marker edits and one native Save per attempt.
- [x] Record failures as counted attempts; hold only uncertain generator writes.
- [x] Test isolated worker loss, editor conflict, missing marker and successful receipt.
- [x] **Accept:** Only native acknowledged Listed Save is a confirmed refresh; no functional source changes.

### P21 — Refresher screen

- [x] Implement complete FIFO queue, compact rate settings, attempts and Not eligible view.
- [x] Implement Pause/Resume, integer cap and derived read-only figures.
- [x] Test 530px tabs, queue scrolling, unknown worker and cap-change presentation.
- [x] **Accept:** Screen reflects scheduler state without imposing its own queue order.

### P22 — AI Helper send-once development

- [ ] Stage optional scratch instructions in Helper workspace, preserve native saved `src/`.
- [ ] Send a valid `prompt.md` once in the retained development tab.
- [ ] Persist attempt identity and test duplicate/delayed/unknown delivery.
- [ ] **Accept:** An uncertain Helper submission cannot be replayed blindly.

### P23 — AI Helper completion and slot release

- [ ] Correlate fresh stream outcome and same draft; reject stopped/errors/reconnect gaps.
- [ ] Check settled native state and zero queued messages.
- [ ] Release Development slot only after verified completion or explicit safe abandonment.
- [ ] **Accept:** Stopped/unknown outcomes never enter Review, and free slots accept the next queued job.

### P24 — Reviews and cancellation UI

- [ ] Implement complete review list, two running slots and full queued list.
- [ ] Review directly opens retained tab; Cancel queued/running/review preserves required state.
- [ ] Test cancellation recoverability, empty state, focus and internal scrolling.
- [ ] **Accept:** No PCMS Helper follow-up controls; no lost draft or leaked running slot.

### P25 — Approve & Publish workflow

- [ ] Recheck settled draft/source after operator approval and before Save.
- [ ] Use complete pre-Save snapshot, native Save/Listing confirmation and correct GitHub status.
- [ ] Recover offline, unknown writes, new versus existing Unlisted generator and draft changes.
- [ ] **Accept:** Only verified approved source is published; no false success or accidental listing.

### P26 — Manual Edit and Publish

- [ ] Open native editor with durable edit hold; guard unsaved work.
- [ ] Publish via snapshot/native Save/GitHub sync without changing existing Listing.
- [ ] End Edit or cancel with explicit draft disposition and correct hold release.
- [ ] **Accept:** No auto-save overwrites dirty draft; published saved version can rejoin Refresher.

### P27 — Rename, Rollback and exclusion

- [ ] Verify native rename and one coherent GitHub folder move.
- [ ] Rollback as new GitHub revision then normal Publish from GitHub.
- [ ] Implement Exclude/Include as local-only setting; test uncertain rename and conflict.
- [ ] **Accept:** No silent replace, deletion, retargeting or exposure of existing Unlisted generator.

### P28 — Contextual recovery and source drift

- [ ] Implement typed causes for slugs, session, Listing, lost tabs, unknown write and external drift.
- [ ] Map each case to existing Manage, Reviews, Utility or GitHub sync destinations.
- [ ] Test multiple holds, crash restart and safe conditional GitHub restoration.
- [ ] **Accept:** Every recognized hold has a safe action or explicit terminal disposition; unrelated work continues.

### P29 — UI fidelity, keyboard and responsive pass

- [ ] Check all screens against v2.0.0 screenshots and the exact Section 8 contract.
- [ ] Fix focus return, nested dialogs, pane scroll, picker behavior and 320px access.
- [ ] Validate light/dark, reduced motion, contrast and no duplicate navigation.
- [ ] **Accept:** No regression in accepted UI routes, spacing, no outer desktop scroll and actionable states.

### P30 — Integration and failure regression

- [ ] Exercise the full synthetic workflow path and interruption matrix.
- [ ] Add targeted browser automation for navigation and state updates.
- [ ] Run operator-controlled live Firefox/Violentmonkey checks when available, recording exact deferrals otherwise.
- [ ] **Accept:** All simulated contracts pass; any unverified native effect is labeled as such and cannot be silently enabled.

### P31 — Release and fresh-profile verification

- [ ] Build/inspect one production userscript; confirm metadata and no mockup/demo payload.
- [ ] Smoke-test install, reload, saved state and focused workflows on a clean disposable Firefox profile.
- [ ] Run full relevant regression, document known limitations and publish verified release artifact.
- [ ] **Accept:** A clean clone builds the same artifact and the recorded tests support only the claims in release notes.

## Completion rule

A phase is complete only when its tasks and acceptance check have evidence in `todo.md` and committed code. Deferred live evidence remains explicitly deferred, even when later independent coding continues. P31 is not a substitute for earlier missing evidence.
