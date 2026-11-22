# PCMS Userscript

**Target:** [Neb963/PCMS-userscript](https://github.com/Neb963/PCMS-userscript) (`main`).

PCMS manages one Perchance account per Firefox profile through a Violentmonkey userscript. It imports generators, manages GitHub source, runs approved AI Helper workflows and pure-FIFO refreshing. The accepted product contract is [references/PCMS-authoritative-specification-v1.4.md](references/PCMS-authoritative-specification-v1.4.md).

**Current status: implemented candidate; live qualification pending.** P00–P30 synthetic contracts and browser checks pass. P01 real installation and P31 fresh-profile/native acceptance remain deferred. Native operations and application GitHub writes are disabled. See `todo.md` and `docs/verification.md` for actual evidence and deferred checks. The v2.0.0 UI file under `references/ui/` is an **isolated simulation**, not production code or a ready-to-install release.

## Start here

1. Read [`AGENTS.md`](AGENTS.md) and the authoritative specification.
2. Read [`to-do.md`](to-do.md): fixed phase plan and completion conditions.
3. Read [`todo.md`](todo.md): current phase, steps, evidence and handoff.
4. Implement only the next unfinished phase, verify its acceptance checks, and update `todo.md` and `to-do.md` before pushing.
5. Read [`ci-guidelines.md`](ci-guidelines.md) before changing CI.

Initial local check (Node.js 24):

```sh
npm run check:bootstrap
npm test
npm run build
npm run check:syntax
npm run check:candidate
```

Checks run build, syntax, immutable-reference and synthetic contract tests. Chromium/Firefox CI uses synthetic Perchance routing. It does not prove native provider behavior. See [operator qualification](docs/operator-qualification.md), [candidate release notes](docs/release-candidate.md), the [integration matrix](docs/integration-matrix.md), and the [full visual audit](docs/visual-audit.md).

## Reference precedence

1. **Product authority:** `references/PCMS-authoritative-specification-v1.4.md` — accepted behavior, UI and safeguards.
2. **Perchance mechanics:** `references/perchance-discovery.md` — observed interfaces, subject to runtime checks.
3. **Visual reference:** `references/ui/` — accepted v2.0.0 mockup and selected screenshots; it simulates operations.
4. **Development process:** `AGENTS.md`, `to-do.md`, `todo.md`, `ci-guidelines.md`, and `docs/agent-development.md` — process, not new product requirements.

When references disagree, preserve the accepted product contract. Record a material discrepancy before writing code; do not silently invent a new workflow, state, service, or UI screen.

## Repository layout

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the proposed module layout and boundaries. The folders are added incrementally. There is no need to build empty abstractions before their first use.

## Security

This repository is public. Never commit Perchance sessions, GitHub PATs, private generator content, local account data, diagnostic exports, real credentials, or cookies. Only use synthetic fixtures in CI. The full original development-principles document is distributed separately to the human planner and is **not** a repository file.
