# Integration and interruption evidence

All results here are **synthetic**. Tests use synthetic accounts, content and credentials. None establishes real native Perchance, Violentmonkey cache/disk or authenticated GitHub effects.

| Boundary / interruption | Evidence | Expected result |
| --- | --- | --- |
| Import → Manual Edit → offline sync → lost ref ACK → restart → drift restoration → historical rollback → ordinary Publication → rename → local exclusion | `tests/unit/lifecycle.test.mjs`, actual GitHubReader/Writer against immutable Git Data fixture | Both Listed and Unlisted retain identity/Listing; source deletions and empty/binary files exact; one ref update after lost ACK; instructions preserved |
| Latest synchronization versus newer pending approval | `sync.test.mjs` | Temporary local priority ends only after latest synchronized work; newer snapshots retained |
| Coordinator/worker takeover, duplicate/delayed commands | `coordinator.test.mjs`, `coherent-store.test.mjs`, `workers.test.mjs`, `native-client.test.mjs` | One current owner, stale terms/documents rejected, no replacement retained draft |
| Native Save dispatched/lost/unlanded/mixed source; Listing interrupted | `publication.test.mjs`, `approved-publication.test.mjs`, `recovery.test.mjs` | Unknown retained, readback before any follow-up, no replay |
| Storage failure before approval or dispatch | `store.test.mjs`, `approved-source.test.mjs`, `manual-edit.test.mjs` | No Save without retained complete source and readback |
| Source/draft/upload mutation during native Save | `approved-source.test.mjs`, `refresher-native.test.mjs` | Reject changed identity, source, file set or bytes |
| Helper unknown admission, duplicate Send, Stop/newer manual turn, foreign/reconnect stream | `development-native.test.mjs`, `development-completion.test.mjs`, `development-actions.test.mjs` | No replay and no false Review; preserve original draft |
| Queued/running/review cancellation; active Helper with idle worker | `development-actions.test.mjs`, `recovery.test.mjs`, `sync.test.mjs` | Explicit Stop/abandon before slot/management disposition |
| Native rename and GitHub folder move lost ACK, occupied target, HEAD race | `maintenance.test.mjs`, `github-writer.test.mjs` | Hold affected generator, exact atomic move or Unknown, no repeated native rename |
| Changed request, instructions, account or repository | `requests.test.mjs`, `sync.test.mjs`, `settings.test.mjs`, `lifecycle.test.mjs` | Original repository and source retained, no silent retarget or overwrite |
| Refresher FIFO/caps/failure/clock jump/restart | `scheduler.test.mjs`, `refresher-controller.test.mjs`, `refresher-native.test.mjs` | Failed/unknown counted, no immediate retry/catch-up; unrelated members continue |
| Recovery multiple holds, dirty draft, external identity, late creation receipt | `recovery.test.mjs` | Release only verified cause; terminal stop retains evidence/native content |
| Secret-safe projection/export | `ui-snapshot.test.mjs`, `overview-journal.test.mjs`, `settings.test.mjs` | No PAT/session/source/draft/prompt in projection or diagnostic exports |
| Navigation/state updates, six widths, themes, keyboard, nested dialogs, short height | `tests/ui/shell.mjs`, `interaction.mjs`, `approval.mjs`, `reviews.mjs` | Canonical routes, focus return and all essential controls reachable |
| Native mutation qualification | `session.test.mjs`, static `LIVE_CAPABILITIES`, `runtime/context.js` | All real native mutations and application GitHub writes disabled |

## Live deferrals

Required but **not run**: fresh Firefox + Violentmonkey installation and isolated realm; fresh/coherent GM storage across tabs and browser restart; designated disposable native inventory/ownership, Save/src upload readback, Listing, Rename, Helper scratch/send/stream/Stop, draft retention; authenticated GitHub writes to an explicitly designated disposable target repository. No operator-designated profile, targets or PAT were supplied. The Firefox connector failed and local browser launch is restricted. CI Chromium/Firefox uses synthetic origin routing only.

P31 must retain these deferrals and keep mutation gates disabled. A disabled build may be distributed as a candidate for inspection; it is not a qualified production release.
