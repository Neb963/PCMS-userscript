# Current-project notes (non-authoritative)

- v1.4 overrides older discovery references to instructions in native src, rank measurements and PersonaMonkey. No companion extension is required.
- Production UI is a closed shadow root; UI tests open it through test-only instrumentation. No production test hook.
- Shell browser launch is restricted; run the synthetic UI suite in Actions. Firefox connector returned Internal error.
- GitHub connector checkpoints and local commits may have different commit IDs; their tree SHAs are checked for equality. Use the remote SHA from `todo.md` when resuming.
