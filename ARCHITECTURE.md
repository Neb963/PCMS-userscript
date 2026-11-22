# Proposed implementation structure

This is a **code organization plan**, not an additional product specification. Implement modules when a phase needs them; merge folders if that removes unnecessary indirection. Do not create empty factories or a generic workflow engine.

```text
PCMS-userscript/
  AGENTS.md                    agent contract
  to-do.md                     numbered phase plan
  todo.md                      current work and handoff
  memory.md / learned.md       short knowledge notes
  ci-guidelines.md / TESTING.md
  references/                  immutable product, discovery, UI reference
  src/
    entry.user.js              future userscript source + metadata
    runtime/                   coordinator, worker dispatch, tab roles
    state/                     one durable userscript store, journal, holds
    adapters/
      perchance/               verified native editor/read-only operations
      github/                  main snapshot, status.md, complete-source commits
    workflows/                 import, reservation, publish, development, sync
    refresher/                 pure FIFO schedule and native Save worker
    ui/                        accepted views and shared interaction primitives
    shared/                    small shared types, validation, errors
  tests/
    unit/                      domain and pure scheduling tests
    integration/               synthetic browser/provider contracts
    ui/                        screenshot + keyboard regression
    fixtures/                  synthetic data only
  scripts/                      build, checks, release helpers
  dist/                         generated artifact; not committed
  .github/workflows/ci.yml      lightweight initial CI
```

## Data and control boundaries

| Boundary | Owns | Does not own |
| --- | --- | --- |
| `state/` | Canonical local settings, holds, FIFO order, attempts, snapshots, journal | External success claims without evidence |
| `runtime/` | One coordinator role per profile, worker assignments, deduplication, rehydration | Native source edits |
| `adapters/perchance/` | Native editor readiness, identity/ownership checks, saved-source readback, Save/Listing/AI Helper operations | GitHub workflow policy |
| `adapters/github/` | Same-commit file snapshots, status parser, conflict-safe updates to `main` | Native Save or UI state |
| `workflows/` | State transitions for a single generator/request, recovery decisions | Global UI rendering or FIFO policy |
| `refresher/` | FIFO pacing and one dedicated native Save worker | Development, approval, regular source publication |
| `ui/` | The accepted screens, state projections, safe operator commands | Persistent authority or remote commits |

## Execution principles

- One Firefox profile and one Perchance account; the operator supplies `account_id` and confirms the session manually.
- One active coordinator role, one Refresher worker, one sequential Utility worker and up to two running Development slots. Reviews retain their original tabs but do not occupy Development slots.
- Hold only the affected generator. Independent verified refresh work continues when GitHub or a development job is unavailable.
- Use the original native draft tab for approved Save. If a Utility job also needs native source access, schedule and verify ownership of the writer before acting. Do not create a second editor that could overwrite a draft.
- Separate UI state, locally persisted state, native Perchance state and GitHub `main`. A display action never proves a remote result.
- Retain complete approved source and its original repository before Save. After an unknown native or GitHub result, inspect the remote state before any retry.
- `references/ui/PCMS-UI-Mockup-v2.0.0.user.txt` must not be imported into the production runtime. Use it only to compare visual and interaction behavior.

## Design choices left to implementation

Use plain JavaScript ES modules and the smallest practical build mechanism unless P01 finds a concrete need for more. Use JSDoc/type checking or a minimal type system if it improves correctness without increasing runtime complexity. Keep the installable output **one userscript**. No backend or companion extension is allowed.

Do not decide product questions by architecture preference. If a required Perchance interface changes, record the observed difference in `todo.md` and adapt the narrow native adapter without altering the workflow contract.

## Violentmonkey cache coherence

The VM implementation keeps a document-local value cache; awaiting `GM.getValue` does not fetch a fresh root. A Web Lock around cached read/modify/write can therefore lose a different tab's update. See the provider's [GM implementation](https://github.com/violentmonkey/violentmonkey/blob/master/src/injected/web/gm-api.js) and [value propagation](https://github.com/violentmonkey/violentmonkey/blob/master/src/injected/web/gm-values.js).

`CoherentStore` keeps one authoritative protected root and one writer in the Coordinator. A follower holds the store Web Lock, requests a protected fresh checkpoint, then sends an expected-revision/write-ID update through a privileged GM mailbox. The Web Lock checkpoint name contains only a random read nonce; it cannot invoke native commands or expose protected data. All native worker commands still use the protected root inbox.

On coordinator takeover, a temporary hidden same-origin document obtains a fresh VM-injected value copy. It returns that copy only through protected GM storage and is removed afterward. Ordinary frames exit before any PCMS UI or worker logic. The transient reply is removed after the primary root is confirmed. This is a demonstrated cache-coherence need, not an additional database, backend, account service or user-facing tab. If this provider path is unavailable, authority acquisition fails closed. Actual VM injection/cache/disk behavior remains a required live deferral before any native write is enabled.
