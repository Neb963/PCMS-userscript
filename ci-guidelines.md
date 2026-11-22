# CI guidelines

**Read before editing `.github/workflows/` or CI helper scripts.**

1. Keep CI fast and useful. Run only the affected unit/integration/UI checks plus inexpensive repository safety checks. Do not rerun unrelated legacy tests on every push.
2. Always validate JavaScript syntax, build reproducibility, dependency lockfile (when dependencies are introduced), and the changed module's tests. Extend the matrix only for real risk.
3. Public repository: **no PATs, Perchance credentials, sessions, browser profiles, private generator source, or secret-bearing logs**. Never put real account secrets in GitHub Actions. Use mocks. Avoid third-party unreviewed Actions.
4. Keep `permissions: contents: read` for CI and do not give `pull_request_target` workflows access to secrets or write tokens.
5. Do not merge a change that breaks an existing accepted behavior. A failing test must be fixed or replaced with a more precise valid test, never silently disabled.
6. Existing mockup is a reference. CI must not install it as the production artifact or treat its simulated network actions as real test evidence.
7. Validate the full distributable userscript near release: metadata, `@match`, isolated execution context, one output file, no `eval`, no embedded secrets, deterministic build, Firefox/Violentmonkey install/interaction.
8. Update CI only when the corresponding phase introduces code that can be verified. Keep the checks and job names unambiguous. Record non-CI live deferrals in `todo.md`.

The current workflow runs bootstrap checks only. Later phases should add small, purpose-specific jobs, not a permanent monolithic test suite.
