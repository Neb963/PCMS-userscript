# Operator installation and live qualification

## Enabled testing build — 0.1.2

The operator explicitly requested full testing after the disabled inspection candidate. Use the **operator-test** artifact for that request. Its five native capability gates and GitHub write gate are enabled; it can create, Save, Rename, change Listing, send Helper prompts and commit GitHub changes. It shows **TEST** next to PCMS. This is authorization for operator testing, not a claim of live qualification.

The normal `npm run build` inspection artifact retains disabled gates. `npm run build:operator-test` produces the separately named enabled artifact. No URL, page variable or stored preference can flip the build mode. Session/ownership/account checks, approvals, snapshots, draft protection, coordinator locks and unknown-write reconciliation remain unchanged.

### Install and start

1. Use Firefox + Violentmonkey and a testing profile/account/repository with owned disposable generators. Initialize GitHub `main` (for example with README) and use a token with repository Contents read/write access. Matching `ready`/`reserved` requests can start automatically after setup. Updating an already configured profile can resume its waiting work; use a fresh testing profile if that work should not run.
2. Open `PCMS-operator-test.user.txt`. In Violentmonkey, edit the existing **PCMS** script, replace its entire contents, and save. The name/namespace and store keys are unchanged so this updates the same script and preserves manager storage. In a fresh profile, create one PCMS script from the file. Keep only one PCMS installation enabled.
3. Close/reopen the PCMS page and reload only clean, idle worker tabs so they execute the new code. Do not reload an unsaved native draft; retain/resolve it first. Keep the previous script and protected saved work available.
4. Open `https://perchance.org/welcome#pcms`. Confirm the **TEST** badge and version **0.1.2** in Violentmonkey. No source edits or extra unlock switch are needed.
5. Settings: enter a manual account label → Apply; sign in to Perchance normally → Confirm session. The label is your chosen ID, not a detected Perchance account identifier. Use it verbatim in `status.md`.
6. Enter the testing GitHub repository URL and PAT through **Set PAT** → **Test** → **Apply**. PAT entry stays outside page-visible inputs/exports. Do not put credentials in chat, source or logs.
7. Generators → Bulk Import: uncheck **Select visible** first if all candidates are selected, then choose only your intended test generators → Import selected. Import should preserve native source/Listing and create complete GitHub folders.
8. Refresher starts paused in a fresh profile. Set the intended hourly limit and click Resume only when ready. Existing profiles retain their prior pause preference.

See `operator-test-guide.md` for a concrete full-workflow test sequence. The remaining evidence below is still unrun; enabling the build does not mark it passed.

## Needed environment and scope

Record browser/manager versions, candidate source commit/tree and artifact SHA-256 and the intended owned test targets privately. For this user-authorized full testing build all capabilities are available together. Test disposable targets before using production generators. Keep failed/Unknown operations protected and reconcile before retrying.

## Exact pending checks

| Check | Acceptance evidence |
| --- | --- |
| Fresh installation/reload | One installed userscript, one reusable PCMS tab; native page preserved; four routes and Settings accessible |
| Isolated manager/PAT entry | Privileged requests remain outside page context; PAT/session/source absent from UI exports and page-visible state |
| GM state across tabs and complete browser restart | Concurrent updates and coordinator takeover preserve latest revision and complete approved snapshots; stale commands cannot dispatch |
| Session and ownership | Manual account label stays fixed after onboarding; sign-out/change pauses native effects; Confirm session restores only intended session |
| Inventory/import | Same native ID and complete saved PJS/HTML/exact src files; no native Save, rename, Listing change or dirty-draft overwrite |
| Reservation/create | One exact ID, Unlisted before requested rename, no duplicate create after timeout; late temporary creation visible and held |
| Native publication | Complete source staged and retained/read back before one Save; deleted/empty/binary src exact; independent saved readback; dirty draft untouched |
| Listing | Existing Listed/Unlisted preserved; only new reserved generator Listed after source verification; intentional Listing change separately confirmed |
| Helper | Scratch instructions stay outside saved src; one prompt; actual native attempt/session correlation; Stop/error/reconnect never Review; retained manual follow-up cannot be mistaken for automatic completion |
| Review/cancellation/manual Edit | Original tab/draft retained across takeover; approval rejects changed draft; End Edit requires clean disposition; Edit-again hold precedes further edits |
| Offline/restart | Approved source survives actual GM disk/restart; Listed verified local version remains eligible; reconnected sync makes one complete commit with deletions and done |
| GitHub conflict/unknown | Concurrent HEAD/request/account changes do not overwrite; lost commit response reconciles without repeated ref update; old repository never silently retargets |
| Rename/Rollback | Same ID/owner/source/Listing; exact complete folder move in one commit; earlier complete source becomes new revision with current prompt/scratch preserved, then normal publication |
| Refresher | One acknowledged native Listed Save per counted attempt; only inert marker changes; failed/Unknown count; no catch-up; unrelated work continues |
| Contextual recovery | Independent holds retained; clean source restoration uses Utility; unknown receipt not promoted to confirmed refresh; terminal Stop managing preserves native generator/drafts/snapshots/evidence |
| Real UI | Both themes, keyboard, nested dialogs, picker, 320px/short view, retained tab activation fallback and no focus stealing in actual Firefox/VM |

Record each outcome as PASS, FAIL or DEFERRED with exact observed evidence. Do not attach private source, tokens or session-bearing traces to this public repository. Keep failed/unknown operations protected while fixing the narrow affected adapter; never blindly replay them.

## Qualification completion

Record each live outcome as PASS, FAIL or DEFERRED with observed evidence, without publishing secrets/private source. After live effects pass, record the evidence-safe result and intentionally decide the normal-use capability policy. Rebuild and recheck upgrade/restart. P01 installation and P31 release acceptance remain open until their actual live checks pass. The operator-test artifact stays labelled as a test build until then.
