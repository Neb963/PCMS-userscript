# Agent handoff contract

An agent resumes from the repository state, not chat history.

1. `git status` and `git log -1 --oneline`.
2. Read `AGENTS.md`, `to-do.md`, then `todo.md`.
3. Locate the first unfinished task in the current numbered phase. Inspect its source, related tests and the specific sections of the authoritative specification/discovery.
4. Run applicable checks, implement the smallest unfinished task, and update `todo.md` with evidence.
5. When a phase meets its acceptance checks, mark that phase's checkboxes in `to-do.md`, commit, push and record the SHA.

The only continuing context in `todo.md` is the active phase, next action, evidence, current blockers/deferrals, and last pushed SHA. Keep `memory.md` to non-obvious, current gotchas. Never paste full logs into these files.

When a live test is deferred by design, keep it explicitly **DEFERRED**, not passed. Do not block independent coding phases solely because a browser or operator is not available. Do not enable a dangerous real-write path based only on simulated evidence.
