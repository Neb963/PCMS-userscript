# Active work — handoff

**Current phase:** P22 — AI Helper send-once development. **Status:** Planned. P21 synthetic acceptance complete.

## Next action

- Read v1.4 §§4.4 and 8.6, relevant native Helper discovery and current reservation/request/worker contracts before changing code. The v1.4 scratch-workspace rule overrides discovery's older instruction-file Save recipe.
- Implement one development job in a retained original tab after verified reservation, with the two-slot limit and a generator-specific hold. Start from verified native saved source; do not publish GitHub source or instruction files first.
- Stage optional `scratch/` instructions only in the Helper workspace, preserving native `src/`, existing drafts and any input. Validate a non-empty `prompt.md`.
- Persist request/repository/generator/tab/document/draft and send-attempt identity before one native Helper submission. Correlate admission evidence; duplicate, delayed, interrupted or Unknown submissions must not be resent automatically. Keep prompts, source, credentials and session identifiers out of diagnostics.
- Add focused synthetic positive and adverse tests for absent optional scratch, missing prompt, dirty/input conflicts, changed requests, two-slot capacity, duplicate delivery and restart/unknown admission. Keep the static Helper gate false until operator-controlled live qualification. Completion/Review belongs to P23.

## Evidence

P00–P21 evidence: docs/verification.md. P21 build/syntax/bootstrap and 200 Node tests PASS. Checks 44982696361 and Chromium/Firefox UI 44982696390 PASS at b81d789b6d9f37d3d28b4dafceb06f79630fad70. Six widths (1440/1024/800/531/530/320), full FIFO/history, empty/unknown state, caps, Pause/Resume, focus/staged input and both themes verified. Remote implementation tree 04c205c67f7c093be373569becf97d839e26cb8e equals local.

## Blockers / deferred checks

DEFERRED — P01–P21 real Firefox/Violentmonkey installation, injection/cache/disk, native receipt/comment parsing/editor cleanup, retained/refresh Save and GitHub synchronization — no operator-designated disposable profile/targets/PAT supplied. All static native write flags remain false. P01 live installation checkbox remains unchecked.

**Last pushed implementation commit:** b81d789b6d9f37d3d28b4dafceb06f79630fad70. This acceptance-only follow-up changes documentation; inspect remote `main` before further writes.
