# Agent instructions — PCMS Userscript

## Authority

- Read `references/PCMS-authoritative-specification-v1.4.md`, the relevant parts of `references/perchance-discovery.md`, and `to-do.md` before changing code.
- Treat the product specification as the decision source. Discovery describes Perchance mechanics, not additional requirements. The v2.0.0 UI reference is **simulation**, not production logic.
- Respect the manual `account_id`, one-account-per-Firefox-profile, three-field `status.md`, pure-FIFO Refresher, original-repository pending work, and accepted UI. Do not add services, extension requirements, automatic account detection, extra states or screens.
- Prefer the smallest change that fully satisfies the current phase and preserves completed behavior. Do not refactor accepted areas without a proven need.

## At the beginning of EVERY task or resumed session

1. Read `to-do.md` and `todo.md`; identify the first unfinished phase and its acceptance checks.
2. Inspect Git status and relevant source/tests. Read `memory.md` only for current gotchas.
3. If the tracker is stale, reconcile it with actual commits and test results. Never assume a checkbox is proof.
4. Write the current phase and concrete subtasks to `todo.md` before implementing.

## While coding

- Work one phase at a time. Keep runtime, persistent state, external effects and UI snapshots separate.
- Make handlers explicit, deterministic and bounded. Reject duplicate or stale commands. Reconcile an uncertain remote write before any retry. Do not steal operator focus or overwrite drafts.
- Keep the implementation small: no speculative framework, generic workflow graph, additional database, or unrelated UI redesign.
- Do not use real credentials or live account content in CI or fixtures. Do not store PATs, sessions or private source in commits, logs, PRs or diagnostics.
- Tests must check failure and inverse paths for the behavior changed. Test integration contracts with synthetic fixtures when no live browser is available. If a phase explicitly requires live verification, perform it when available; otherwise record the exact deferred test and continue only when `TESTING.md` permits deferral.
- Read `ci-guidelines.md` **before** creating or changing GitHub Actions or CI scripts.

## Before marking a phase complete

1. Run its named checks and the relevant existing regressions; record exact commands and results in `todo.md`.
2. Confirm the product contract and UI behavior are preserved. A working mockup is not evidence that native operations work.
3. Mark each completed checkbox in `to-do.md` only when implemented and verified; record remaining deferrals without falsely checking them.
4. Commit and **push to GitHub** frequently, including the tracking updates. Record commit SHA and any unresolved issue in `todo.md`.
5. Keep `memory.md` to non-obvious operational facts. Add generalizable mistakes and lessons to `learned.md` when appropriate. No long progress diary.

## Handoff

A fresh agent must be able to proceed using only repo files and Git history. Keep `todo.md` limited to: current phase, next action, verified evidence, blockers/deferrals, and last pushed commit. No hidden state or unpushed work is a valid handoff.
