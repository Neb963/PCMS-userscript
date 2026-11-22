# Verification ledger

## P00

- Public remote was empty; no open PRs. Scaffold only, operator-only directory excluded.
- `npm run check:bootstrap` PASS: 32 phases and all 11 reference SHA-256 entries.
- `npm test` PASS: 3 bootstrap tests; no runtime feature claimed.
- Remote commit `d33ebffcc51b95fdda0a70104f379acaeb10c742`, tree `a7c73298be69f2de87f960fa970a1ed00202b3d2` matches local index exactly.
- [Actions run 44965967163](https://github.com/Neb963/PCMS-userscript/actions/runs/44965967163) PASS, including clean checkout, both commands.
- References contain public example identifiers only; no operator data was added.

## P01

- `npm run build`, `npm run check:syntax`, `npm test`: PASS (5 tests).
- Deterministic single-file bundle; strict metadata, isolated execution, syntax compilation, named-tab reuse and popup/unavailable paths tested.
- No native write path implemented. Reference mockup is not bundled.
- DEFERRED: actual install/reload/menu launch in Firefox + Violentmonkey; requires disposable browser profile. P01 acceptance remains open for this live check.

## P02

- `npm test` PASS (9 tests), build and syntax PASS.
- Canonical status states/actions; manual account binding; ID/slug/Listing; independently keyed holds; original-repository pending updates; exact binary source validation.
- Negative paths cover duplicate/missing status, invented states, unsafe paths, incomplete panels, malformed bytes and one-hold resolution retaining another.

## P03

- `npm test` PASS (14 tests), build and syntax PASS.
- Single protected root with schema validation, Web-Lock transaction serialization and exact write/readback.
- Restart retains complete binary source, original repository and all independent holds; dispatched actions become Unknown without automatic replay.
- Quota errors, mismatching readback, unavailable lock and unsupported schema fail without resetting stored work.

## P04

- Build, syntax, bootstrap, 15 Node tests PASS.
- [Actions 44966701167](https://github.com/Neb963/PCMS-userscript/actions/runs/44966701167): Chromium and Firefox UI steps PASS at 1440/1024/530/320px; four tabs, Settings/subviews, Enter activation, persisted theme, shared header bounds, no outer overflow, preserved underlying native fixture.
- Closed production shadow root, native dialogs and app-styled keyboard picker. No sample data or remote success substituted.
- Separate path-scoped UI workflow avoids browser runs for unrelated pure-module changes.
- Actual Violentmonkey installation remains P01 deferred; UI evidence uses controlled synthetic pages.

## P05

- Build/syntax and 17 Node tests PASS. P04 follow-up [UI run 44966839223](https://github.com/Neb963/PCMS-userscript/actions/runs/44966839223) PASS.
- Runtime holds one coordinator Web Lock, increments protected terms and persists job claim/dispatch/acceptance before effects.
- Tests exercise simultaneous candidates, owner loss, durable Unknown takeover, duplicate dispatch/delivery, wrong document and rejected late result. Same-generator unresolved work prevents another dispatch; unrelated jobs remain possible.

## P06

- Build/syntax and 22 Node tests PASS.
- Privileged GM store/listener inbox/outbox, canonical saved commands and per-document acceptance. Managed workers are coordinator candidates.
- Background-only tab creation, role capacity, retained-tab activation fallback, hidden-worker roundtrip, duplicate pump, selected-tab protection and lost-worker isolation tested.
- Native capability handler intentionally rejects unavailable actions. Actual tab/window activation in Violentmonkey remains DEFERRED until the disposable-profile test; no draft is replaced to simulate activation.

## P07

- Build/syntax and 25 Node tests PASS.
- Manual binding and explicit confirmation, opaque session-change detection, independent owner read and exact editor ID/slug/draft readiness.
- Tests reject signed-out/changed sessions, wrong ownership and target, pending draft choice and locked account changes. Account ID is never derived from native user data.
- Native write capability flags remain false; no UI setting can bypass them. Live owner/session verification remains DEFERRED with the Firefox/Violentmonkey disposable-profile checks.

## P08

- Build/syntax and 31 Node tests PASS.
- Independent native inventory/owner/metadata reads and complete saved PJS/HTML/manifest-byte retrieval, with metadata coherence checked before/after all files.
- Tests cover empty src, missing panels/manifest/file, corrupted byte length, wrong ID, concurrent Save, rename and absent inventory. No absence is treated as deletion.
- Privileged HTTP restricts HTTPS hosts and credential target; bytes and challenge/redirect responses validated. Native reads require live disposable-profile confirmation before operational claims.

### P03/P06 compatibility correction

- Checked [Violentmonkey privileged API](https://violentmonkey.github.io/api/gm/): removed unsupported GM_getTab/GM_saveTab and setParent option; use documented GM.getValue/GM.setValue promises.
- Worker URL/name contains only a non-secret worker reference. Protected root assignment/document/term remains the authority; a reload cannot blindly re-execute a command.
- Build/syntax and 32 tests PASS; production API allowlist regression added. Prior P08 UI run 44967606581 pending at this checkpoint.

## P09

- Build/syntax and 37 Node tests PASS.
- Exact repository URL validation; one main commit/tree with content-addressed blobs checked by Git blob SHA/byte length; complete source and manual-account status selection.
- Request identity uses status path history and instruction blob IDs. Closed stale ready/instruction edits cannot replay; a new ready needs explicit transition evidence.
- Tests cover lookalike URLs, missing/corrupt source, truncated trees, changed repository, account mismatch, stale instructions, offline preservation and Check now without schedule reset.
- Runtime polls only configured repositories; outage leaves prior records and independent FIFO untouched.

## P10

- Build/syntax and 40 Node tests PASS.
- Complete source/status commits use Git Data API, preserve unrelated files/instructions, remove obsolete src and always update main without force after checking HEAD.
- Persisted operation intent, object/commit/ref stages and protected global commit lock. Uncertain results require history/tree reconciliation; no blind second commit/ref dispatch.
- Tests cover atomic source/deletion, separate status writes, changed generator baseline, HEAD race and landed ref with lost response. No configured live repository was written for tests.

## P11

- Build/syntax and 43 Node tests PASS at UI checkpoint; targeted session/settings regression now 7 PASS (44 total next full run).
- [UI run 44968484461](https://github.com/Neb963/PCMS-userscript/actions/runs/44968484461): Chromium and Firefox steps PASS at four widths, including account/repository drafts across navigation, credential absence from DOM and invalid polling preserving applied settings.
- Settings Test→Apply invalidation, pending-work confirmation and original repository credential retention verified. Native credential dialog keeps PAT outside page input; main Settings shows only masking.
- Fixed server session-token rejection to invalidate confirmation even if native page login flag is stale.

### P03/P05/P06 cache-coherence repair during P12

- Provider source shows `GM.getValue` uses a document-local cache. Original cached root read/modify/write was insufficient for concurrent tabs.
- Added one Coordinator writer, protected checkpoint/CAS messaging and fresh-injection startup read. No ordinary frame can start PCMS or native operations.
- Build/syntax and 50 Node tests PASS. New tests deliberately give a follower a stale cache and verify retained approved source, both independent updates, fresh takeover and fail-closed persistence failure.
- Original P12 [UI run 44968961811](https://github.com/Neb963/PCMS-userscript/actions/runs/44968961811) PASS. Updated startup/iframe path needs the next synthetic UI run; actual VM cache/injection persistence remains DEFERRED.

- Cache-repair UI run 44969857009: Chromium PASS; all Firefox behavior assertions passed, but Firefox reported protocol evaluation cancellation when the successful transient probe removed its own document. Fixed test injection to execute from the frame's DOMContentLoaded handler; successful probe now explicitly requires a verified Coordinator and removal of the transient frame. No behavior assertion was removed.

- UI run 44970004436: Chromium PASS; Firefox startup waited for verified authority rather than accepting a cached shell. Fixed the probe lifecycle to resolve its protected reply before removing the child document on a parent task. Added ordering regression and startup diagnostics containing synthetic status only. Read-only header check confirms Perchance welcome currently uses `X-Frame-Options: SAMEORIGIN`; real VM injection remains deferred.

- UI run 44970210617: Firefox did not establish authority; diagnostics showed Unverified after probe removal, with no page exception. The fixture now registers injection before reading a potentially not-yet-final child URL, and records synthetic startup stage metadata. Failed authority acquisition marks storage unavailable; an unverified case set can no longer show No action required. Coordinator bootstrap-failure cleanup regression added (52 total tests PASS).

- Firefox fixture trace in 44970465169 identified init-script execution before the child URL became available (empty URL, no probe injection). The test now injects on actual frame navigation and accepts protocol teardown only when the exact nonce has a protected GM reply, authority is Verified, and the probe frame is removed. All production/page-error assertions remain active.

### P12 final verification

- [UI run 44970649444](https://github.com/Neb963/PCMS-userscript/actions/runs/44970649444) PASS in Chromium and Firefox, four widths, including verified authority, exact protected probe nonce, probe removal, history details/focus and preserved settings drafts.
- [Synthetic run 44970649403](https://github.com/Neb963/PCMS-userscript/actions/runs/44970649403) PASS (52 tests, build, syntax, reference hashes).
- The earlier Firefox failures were synthetic injection/lifecycle timing defects; receipt-based assertions remain active. Actual VM provider persistence/injection is still deferred and native writes stay disabled.

## P13 verification in progress

- 57 Node tests, build and syntax PASS.
- UI run 44971376854 reached the separate unbound setup case; its new locator matched both the Settings icon and the valid Overview recovery link. Scoped the test to the accepted top-right icon's accessible label; no UI behavior/assertion removed.

- Added P13 positive nested-confirmation coverage: local Exclude retains Listing, workflow and both independent holds, keeps Manage open and restores focus to the updated Include action. Authority reads now wait for in-flight persistence, preventing a storage callback from rendering a half-committed state. Targeted ordering regression passes; 58 total Node tests/build/syntax PASS.

### P13 final verification

- [UI run 44971751107](https://github.com/Neb963/PCMS-userscript/actions/runs/44971751107) PASS in Chromium/Firefox at four widths, plus separate unbound setup. Selection/scroll, hidden selections, Manage, nested confirmation and focus, locked IDs, original Listing/workflow/holds and existing regressions verified.
- [Synthetic run 44971751136](https://github.com/Neb963/PCMS-userscript/actions/runs/44971751136) PASS (58 tests/build/syntax/hashes). Remote and local tree hashes match.

## P14 verification

- Build/syntax and 67 Node tests PASS. Complete source/status import, folder-conflict isolation, Listed/Unlisted preservation, durable unknown-commit reconciliation, late local reporting and source drift tested.
- Import preview is bound to its tested repository; queue rejects changed settings. Missing binary payload cannot be mistaken for a zero-byte saved file. Cancelling preview stops further read work without cancelling an explicit queued Import.
- Runtime coordinator owns sequential import commands and guarded GitHub writes. Integration write proof remains false; no real VM/PAT/provider operation is claimed.

## P14 — Bulk Import

67 Node tests, build and syntax pass. Synthetic UI run 44973566403 (Chromium and Firefox) and checks 44973566397 pass at remote 2271908424ab290c6be515515408fe6585993393. Import preselection, folder skips, exact source/deletions, retained snapshots, original repository, uncertain commit and post-commit source drift are covered. The delayed Manage inspection race preserves both current exclusion state and keyboard focus. Live VM/private GitHub/native inventory evidence remains DEFERRED; write gates remain closed.

## P15 — Reservation

Build/syntax and 81 Node tests pass. SlugReader uses exact normalized visible messages and independent saved identity; HTTP codes/iframe shells do not establish availability. Reservation checkpoints create before dispatch, retains native ID before Unlisting/Rename, rechecks availability, verifies owner/ID/slug and queues original-repository reserved/blocked writes. Lost create is never replayed; same-ID landed Rename reconciles without a second request. New native receipt observer watches the matched native fetch response and excludes credentials/source/arbitrary response data. Utility navigation requires a hidden clean original document, unexpired current-term intent and new document registration. A request factory and protected worker handlers are bundled; automatic request scheduling is P16. Native capability flags remain false; Firefox exportFunction/native endpoints and disposable reservation are DEFERRED.

P15 remote 9866bf1f75fce06c4a7057f1acd217f4ace60106: synthetic checks 44974115654 and Chromium/Firefox UI 44974115645 PASS. Additional same-slug unresolved-creation guard has a focused passing inverse test (82 total Node tests).

## P16 — Publish from GitHub

Build/syntax and 100 Node tests PASS. Publication reads complete source from the original immutable request revision, checks current source/instructions/assignment/request identity, retains source/previous saved version before native dispatch, and holds one per-generator source lock. Native draft staging requires a clean same-identity editor, removes obsolete src files and validates exact byte readback. Native Save uses a matched acknowledged receipt plus independent complete saved source. Existing Listing is preserved; only new generators are Listed after source verification. Lost Save/Listing responses reconcile without repeat; mixed/old/unreadable source stays held. Native completion with GitHub offline becomes Local done / Sync pending against the original repository without blocking eligible Refresher work. Automatic request claims ignore stale ready, hold changed requests and wait behind live capability qualification without opening tabs. Utility uses two internal-scroll panels, full job list and verified steps only. UI regressions pending. Live deploy/receipt/source/Listing and real GitHub status checks remain DEFERRED and statically disabled.

P16 remote 52dc6daa903dd7e76b5d07de9da2c9d7b002d8ae: checks 44974926464 and Chromium/Firefox UI 44974926515 PASS, including 35-job Utility selection, four routes and internal scrolling at four widths. Final targeted checks add blocked-status closure after safe pre-Save failure and prevent a new ready request from silently replacing a held temporary generator (101 Node tests PASS). Native live evidence remains DEFERRED.

## P17 — Complete approved-source snapshot

Build/syntax and 109 Node tests PASS. ApprovedSource captures a private immutable candidate, requires explicit confirmation for review/edit and settled native Helper state, persists exact full source/previous source/Listing intent/original repository/pending status plus generator/draft/tab/document/approval identities, reads back that same snapshot and rechecks current source immediately before Save. Changed panels, file deletion/binary bytes, draft switch, reloaded document, different tab, ownership identity, metadata tampering, quota and write/readback failures all fail closed. A change during persistence retains the approved snapshot without authorizing Save. Utility now uses the same proof; previous-source and request metadata are retained atomically. Explicit review/manual action wiring is P25/P26; no approval or native live success is claimed. Live VM persistence/large snapshots, native complete draft capture and original retained-tab Save remain DEFERRED; capability flags stay false.

P17 remote ec302f59c95ec4303183caa38c3d4b2d179c7647: checks 44975374094 and Chromium/Firefox UI 44975374083 PASS. Local/remote tree equality was also checked at P16; source-only follow-ups retain explicit live deferrals.

## P18 — Offline synchronization and conflicts

Build/syntax and 141 Node tests PASS. Synchronizer keeps original repositories and credentials while needed, verifies native completion before source writes, commits complete approved source/status atomically or status alone as appropriate, handles same-source success and unrelated main changes, and reconciles uncertain receipts before further effects. Source/request/account conflicts are distinct. Only a verified approved local snapshot enables source choices, with fresh comparison fingerprints/main revision and explicit confirmation. Keep local rebases synchronization; Publish GitHub queues the ordinary publication workflow and retains the previous approved snapshot until new native source/Listing verification. Explicit Reassign creates one successor without deleting the original source; Unknown original writes and incompatible target requests block it. Stop manages only local control, retains source/unknown evidence and native tabs, and requires Development disposition first. Confirmed Stop inhibits follow-ups immediately through protected state, even during an in-flight Save. A late created receipt retains the temporary ID without reviving stopped management. Prepared Import resumes only after native/source revalidation. Credentials are removed after the last pending dependency resolves.

Runtime consumes protected UI intents in the active Coordinator even when the operator tab is a follower. Duplicate intents/checks and stale comparison/target settings are tested. The compact Sync Jobs/Source & decision UI has a fixed action footer, <=850px Jobs/Details tabs, optional evidence and comparison-only raw source. Browser run 44977336333 and checks 44977336373 PASS at 5849dad2fa1ba524447c6a868edc23aad9f24d5b, including 32 records, disabled pre-comparison choices, Cancel preserving the hold, focus return and 1024/1440px default details without scroll. Final follow-up regression is pending. Real offline approval/native/old-repository synchronization remains DEFERRED; static write gates stay false.

P18 final remote a64be5ae0500b6a9c294430e212d39eb513afcee: synthetic checks 44977640186 and Chromium/Firefox UI 44977640270 PASS. 141 Node tests; local/remote tree c8781955aae8688f42c27971cbd003739a989713 verified equal. All P18 synthetic acceptance checks are accepted; live scenarios remain explicitly DEFERRED.

## P19 — Pure FIFO scheduler

Build/syntax and 158 Node tests PASS. FIFO retains surviving order, appends returning/new eligibility, checks at most a full pass and rotates capped members. Selecting or skipping without dispatch spends no Save; attempt dispatch rotates to tail and durably retains/readbacks the attempt. Failed/Unknown attempts count against rolling account/per-generator caps, actual completion conservatively anchors spacing, cap changes retain history, and n=0 has no fabricated rates. Pause/Resume, delayed timers, wall-clock changes, restart and monotonic reversal do not catch up or burst. The Coordinator owns monotonic time; restart applies a spacing fence. Old routine history is bounded while rolling-limit and unknown recovery evidence remain. Storage failure cannot authorize dispatch. Coordinator reconciliation updates clock/FIFO only when necessary, with no per-timer root-write feedback. Runtime availability defaults false; P20 owns native worker/receipt integration. Browser regression pending; no live refresh Save is claimed.

P19 remote c0eacfe17b4267acb474f74e1b776d6812e2edbd: synthetic checks 44978381380 and Chromium/Firefox UI 44978381382 PASS (158 Node tests). P19 pure/synthetic acceptance is complete; no native refresh capability enabled.

## P20 — Dedicated Refresher

Build/syntax and 183 Node tests PASS. Safe leading comment markers preserve BOM/CRLF/empty panels and exact functional source/src; verified Import/publication retain a functional fingerprint. Refresher preparation requires hidden clean same-ID/owner Listed source matching that fingerprint, stores/readbacks the full marker draft before changing only panel comments, then the Coordinator claims a paced attempt. The Save worker rechecks original draft/document, source, Listing and exact native panel/manifest request. Only a matched native saved acknowledgement plus independent complete source, both attempt markers and Listed readback confirms refresh. Known provider rejection counts as failed and may restore only its own untouched marker draft without Save. Lost reply, wrong/missing marker, unexpected fork/Unlisting or uncertain readback never confirms. Failed/Unknown attempts count, known skips do not; atomic outcome/history/hold writes and durable RPC results recover without another Save. Unknown affects only that generator, with its original tab/source retained. Guard checks run again at native transport; one invocation cannot dispatch a second matched request, and a hung frontend is bounded while receipt evidence survives. No rank reads.

Takeover repairs retain uncertain Utility/Refresher workers without consuming their active role; Development slots stay occupied. Independent source holds block writers; read-only result inspection remains possible. Correlated rechecks release only their own interruption holds. Browser regression pending. Actual Firefox/Violentmonkey native transport, comment parser/editor cleanup, Saved Listed receipt and worker loss remain DEFERRED; static Save capability false.

P20 follow-up: 185 Node tests PASS. Approved publication also verifies its outgoing panels/exact src set and uploaded bytes before transport; a corrupted zero-byte upload cannot reach Save. Native transport rejects options-body mutation during an async guard and validates canonical worker/job ownership. Checks 44980455742 passed; UI 44980455714 exposed a recurring Manage focus race. The eligibility control is now reused across confirmation/inspection/heartbeat redraws, older inventory snapshots are ignored, and the UI refresh reads state after observing session. The browser test asserts that the original eligibility node remains connected as Include before checking focus; final regression pending.

P20 browser/checks at 6c453584c640c7eb05bb1eee6b980f3ea55e3a24: UI 44980953769 and checks 44980953760 PASS. The original Manage eligibility element remains connected as Include after confirmation. Final focused follow-up adds a changed operator draft during a rejected Save: retain/hold the draft and never restore over it. 186 Node tests PASS; known persisted successful results also retain their reusable worker after one-time outcome storage failure. P20 synthetic acceptance complete; live requirements stay DEFERRED.


## P21 — Refresher screen (in progress)

Full FIFO queue and Not eligible/Manage view, compact Rate/Recent attempts panels, 530px Queue/Rate/Attempts panes, Pause/Resume and integer 1–3600 cap are wired to protected local state. History remains intact on cap changes and pause. Only counted failed/Unknown attempts consume rolling limits; Unknown worker data is a snapshot. Derived timing uses a Coordinator-owned clock packet; heartbeat liveness uses observed monotonic pulse changes and native proof is invalidated on document replacement.

Pause during preparation restores only its own unchanged marker draft without a Save or counted attempt; an operator edit during readback is retained and held. A dispatched Save may finish. `npm run check:bootstrap`, `npm run build`, `npm run check:syntax`, `npm test` (199 tests), `git diff --check`: PASS. P21 browser assertions are pending in existing Chromium/Firefox CI because local Chromium socket creation is denied. Native Firefox/Violentmonkey qualification remains DEFERRED and static write capabilities remain false.

P21 first browser runs at b95792dcc0733256857f74986bc8c1769cc34f4d: checks 44982495676 and UI 44982495678 PASS (Chromium and Firefox). Follow-up keeps the two-column queue/rate layout above 530px, checks 531/800px boundaries and rate-figure containment, and confirms Pause after dispatch permits exactly the current Save. Build/syntax and 200 Node tests PASS; final browser regression pending.

P21 synthetic acceptance: checks [44982696361](https://github.com/Neb963/PCMS-userscript/actions/runs/44982696361) and browser run [44982696390](https://github.com/Neb963/PCMS-userscript/actions/runs/44982696390) PASS at b81d789b6d9f37d3d28b4dafceb06f79630fad70 (tree 04c205c67f7c093be373569becf97d839e26cb8e equals local). Chromium and Firefox verify 1440/1024/800/531/530/320px plus empty setup: complete FIFO order and 42 attempt records, unknown worker snapshots, Not eligible/Manage navigation, invalid/applied caps, staged input and focus through updates, unchanged queue/history on Pause/Resume, internal scrolling, dark/light and visible rate figures. Final Node regression: 200/200 PASS. P21 is complete for synthetic UI/adapter evidence; real P01 installation and P01–P21 native qualification remain explicitly DEFERRED, with all native write gates false.

## P22 — Helper send once

209 Node tests PASS; build/syntax/bootstrap PASS. Public-source mechanics were checked without account mutation (docs/native-helper-interface.md). A verified reservation enters a protected two-slot Development queue. Prompt/scratch come from one pinned request; scratch uses the real separate native Files adapter and byte readback. Baseline source, draft, Listing, composer and session binding are checked before a durable send-once intent. The scoped native transport admits one matching commit; duplicate/unknown/rejected/lost admission cannot replay. Unit fixtures cover no optional scratch, changed request, independent hold, existing chat/input/draft, scratch collision, quota failure, two occupied/lost slots and correlated stream IDs. Production entry is wired; native Helper flag stays false. Browser regression is pending; native admission/isolated execution is DEFERRED.
