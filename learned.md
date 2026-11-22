# Reusable lessons (post-mortem)

No implementation lessons have been recorded for this repository yet.

After discovering a generalizable issue, record **symptom → root cause → prevention** in one short entry. Do not turn this into a task tracker.

- Verify userscript APIs against the target manager's official reference; superficially similar Tampermonkey APIs are not a Violentmonkey compatibility guarantee. Use asynchronous protected storage for pre-effect persistence.

- For a deliberately transient document, inject the synthetic manager script from its lifecycle rather than awaiting a browser protocol evaluation that the successful completion will destroy. Assert the protected reply and final document removal instead.

- UI scroll defects can survive a document-overflow check: global panel overflow creates multiple card scrollers, and auto grid tracks can shrink enough for card contents to overlap. Use explicit ownership, intrinsic tracks, real wheel checks and screenshots with short/enlarged-content fixtures. Include the complete built userscript: a two-pixel overflow from an unused empty-notice gap was absent in the component fixture.
