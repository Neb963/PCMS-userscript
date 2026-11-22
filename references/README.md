# Immutable reference snapshots

- `PCMS-authoritative-specification-v1.4.md` — **product authority**. The operator's accepted requirements, including UI behavior.
- `perchance-discovery.md` — observed Perchance interfaces and limitations. Validate against the actual browser before use.
- `ui/PCMS-UI-Mockup-v2.0.0.user.txt` — accepted high-fidelity **SIMULATED** interface, not a working PCMS automation engine.
- `ui/screenshots/` — selected actual Chromium captures of the accepted mockup; use as visual targets, not runtime correctness evidence.

`SHA256SUMS` protects these particular reference snapshots from accidental edits. If the operator formally supplies a newer authoritative specification, replace the snapshot and deliberately regenerate its hash; do not silently rewrite the source document during coding.

Do not import or bundle the mockup inside the production userscript. The repository's `src/` tree is *PCMS source code*, not a Perchance generator's own saved `src/` files.
