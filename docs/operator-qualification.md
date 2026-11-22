# Operator installation and live qualification

## Current candidate

The candidate implements the workflows but **cannot perform native mutations or application GitHub writes**. All `LIVE_CAPABILITIES` and `INTEGRATION_PROOF.githubWrite` remain false. A synthetic test is not a reason to change them. There is no normal-use unlock switch.

The package contains `PCMS.user.txt`. For an explicitly designated disposable test profile, rename a copy to `PCMS.user.js` and open it through Violentmonkey's installer. Inspect the metadata: PCMS, version 0.1.1, only `https://perchance.org/*`, content injection, and the three documented connect hosts. Keep the previous installed version and protected local state available when updating. Do not install the simulated reference.

Read-only inspection is useful, but its success does not qualify Save, Listing, Rename, Helper or authenticated GitHub writes.

## Needed environment and scope

The remaining live checks require a dedicated disposable Firefox profile with Violentmonkey, a manually chosen account label and signed-in Perchance session, explicitly designated owned disposable Listed and Unlisted generators, a free disposable slug, and a disposable GitHub repository. Enter its narrowly scoped credential only through PCMS's isolated credential entry; never put it in source, fixtures, screenshots, logs, reports or chat.

Record the profile/browser/manager versions, candidate source commit/tree and artifact SHA-256, designated targets and allowed effects privately. A developer must prepare and review a qualification build constrained to those designated targets and only the capability currently being checked. Do not enable every capability globally or use production generators to discover whether an adapter works.

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

Only after the relevant live effects pass, commit the evidence-safe qualification result and intentionally update its matching gate. Rebuild, recheck clean-profile upgrade/restart and rerun affected synthetic regressions. P01 installation and P31 acceptance can then be completed. Until then this is a disabled candidate, not a qualified operational release.
