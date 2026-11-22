# Reusable lessons (post-mortem)

No implementation lessons have been recorded for this repository yet.

After discovering a generalizable issue, record **symptom → root cause → prevention** in one short entry. Do not turn this into a task tracker.

- Verify userscript APIs against the target manager's official reference; superficially similar Tampermonkey APIs are not a Violentmonkey compatibility guarantee. Use asynchronous protected storage for pre-effect persistence.

- For a deliberately transient document, inject the synthetic manager script from its lifecycle rather than awaiting a browser protocol evaluation that the successful completion will destroy. Assert the protected reply and final document removal instead.
