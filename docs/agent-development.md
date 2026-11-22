# Development practice (agent-facing)

The operator's original development-principles file is supplied separately to the planning agent, outside the repository. This page contains only implementation-facing rules.

- **Quality over process:** Use minimal, high-leverage guardrails. Do not add approval theater or speculative infrastructure.
- **Continuous handoff:** Commit and push meaningful, tested changes frequently. Keep `todo.md` current so a new agent can resume without previous chat context.
- **Targeted tests:** Prefer fast, synthetic tests and CI. Add native Firefox checks where required and practical. Record deferred live checks explicitly instead of marking them passed.
- **Public repository:** Keep credentials, sessions, private source, logs containing secrets and browser profile data out of Git and CI.
- **Efficient CI:** Run impacted tests and cheap baseline checks, not every historical test after every edit. Read `ci-guidelines.md` first.
- **Two knowledge files:** `memory.md` holds non-authoritative local hints. `learned.md` records reusable engineering lessons for future work. Both stay concise.

These practices do not override the product specification.
