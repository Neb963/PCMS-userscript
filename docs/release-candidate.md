# PCMS 0.1.2 — inspection and enabled operator testing

The operator requested full live testing after the 0.1.1 disabled inspection build. Version 0.1.2 provides two explicit build profiles with the same installed userscript identity and storage keys.

| Build | Output | Real native/GitHub writes | Purpose |
| --- | --- | --- | --- |
| Default inspection | `dist/PCMS.user.js` | Disabled | Read-only inspection until normal-use qualification |
| Operator test | `dist/PCMS-operator-test.user.js` | Enabled | User-authorized full workflow testing; shows TEST |

The downloadable **enabled-test** package contains the operator artifact as `PCMS-operator-test.user.txt`. Use this one for full testing. It enables Save, create, Rename, Listing, Helper and GitHub writes. It preserves session/account/owner checks, source snapshots, approvals, draft protection, concurrency and unknown-write reconciliation. A fresh profile still starts Refresher paused; existing settings are retained. No URL, page variable or persisted toggle unlocks the normal artifact.

See [operator installation](operator-qualification.md) and the [full testing sequence](operator-test-guide.md). Replace the existing PCMS script rather than installing a second copy. Native browser behavior is still unverified, so start with owned disposable targets and a testing repository; matching ready/reserved requests may run automatically after setup.

## Reproducible artifacts

- Inspection: 461254 bytes, SHA-256 `7b8045521115ba6bd3b614ab09303032819c3f5afbe3ce3b6135ffa0a58b9e63`.
- Enabled operator test: 461276 bytes, SHA-256 `3447f02e3956c48cfe16832494b0aae4778fcd460800344bffeff679bc148de7`.
- Working and clean committed-tree builds agree. Metadata, version, isolated context, hosts, single-file output and absence of known fixture/token/private-key payload are checked for each profile.
- 270 Node tests pass, including enabled/disabled policy, retained session/ownership/account-lock guards, publication availability, stable installed identity and waiting-request continuation without duplication. Checks [45060377096](https://github.com/Neb963/PCMS-userscript/actions/runs/45060377096) and UI [45060377092](https://github.com/Neb963/PCMS-userscript/actions/runs/45060377092) PASS at 7bc24ad4fcaf2caa7160f45627f2948b12d7a545. Both artifacts pass full Chromium/Firefox UI suites; the enabled profile passes a further 216 visual captures per browser with zero strict findings. See verification.md.

The P29 visual repairs are retained. Live P01/P31 acceptance remains unverified. Enabling the testing artifact is not evidence that native workflows pass and does not enable the default normal-use artifact.
