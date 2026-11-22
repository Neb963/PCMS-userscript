# Active work — handoff

**Current phase:** P00 — Repository bootstrap and CI. **Status:** In progress.

## Next action

- Push the verified scaffold to empty public `main` through the GitHub connector.
- Verify remote tree, bootstrap Actions result and fresh checkout checks.

## Evidence

- GitHub metadata: public repository, default `main`, empty; no open PRs.
- `npm run check:bootstrap`: PASS (32 phases, 11 immutable reference hashes).
- `npm test`: PASS (3 bootstrap tests). No runtime behavior claimed.
- Read AGENTS, v1.4 authority, discovery, architecture, testing and CI guidance.
- Discovery's old instruction-file/native-src and rank/PersonaMonkey references conflict with v1.4; v1.4 controls: scratch stays outside src, no ranking, no companion extension.

## Blockers / deferred checks

- Direct shell GitHub transport unavailable; using authorized GitHub connector for commits and remote verification.
- No live Perchance account or disposable targets designated. Native actions require deferred Firefox/Violentmonkey proof before normal-use enablement.

**Last pushed commit:** None yet.
