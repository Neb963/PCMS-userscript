# PCMS 0.1.2 — full operator testing

Use the enabled `PCMS-operator-test.user.txt`, which shows TEST in the top bar. The previous 0.1.1 download was an inspection build and deliberately blocked mutations. This build removes that blanket restriction; ordinary validity/ownership/session/draft/conflict checks still apply. Live success is not yet verified.

Install/update and setup steps: [operator-qualification.md](operator-qualification.md). A testing repository and owned disposable generators are appropriate: this script really writes data, and matching requests can start automatically. Keep only one PCMS installation enabled. Never reload an unsaved native editor merely to update the script.

## Suggested sequence

1. **Import:** choose one owned Listed and one Unlisted test generator. Uncheck Select visible before selecting the intended candidates. Import, then inspect their GitHub folders for complete `main.pjs`, `main.html`, exact `src/` bytes, and valid `status.md`. Native source and Listing should stay unchanged.
2. **Refresher:** start with one eligible Listed generator, set a low hourly limit, Resume and observe one Save/attempt. Pause should preserve queue/history; a failed or Unknown Save must not be retried blindly. Unlisted/excluded/held generators remain ineligible.
3. **Publish existing:** change a test folder's complete source, keep `account` equal to your manual label, set `action: publish_from_github` and `state: ready`, and commit to main. Use Settings → Check now. Verify exact saved source, unchanged native ID/Listing, and one complete `done` update. Existing Unlisted must remain Unlisted.
4. **Create/reserve:** use a free disposable slug folder with complete source and `publish_from_github / ready`. Verify one created native identity, complete source before Listing, no duplicate after waiting/reload, then final done. Stop and inspect Unknown instead of reissuing the request.
5. **Develop/review:** use `action: develop`, `state: ready`, `prompt.md`, and all three scratch files (`AGENTS.md`, `design-specification.md`, `to-do.md`). Inspect the retained draft in Reviews. Cancel must retain it; explicit approval must recheck the current settled draft before Save. Stop/errors must not become Review.
6. **Manual Edit:** Generators → Manage → Edit. Modify the retained native editor, then use the approval flow. End edit must require a clean disposition and preserve saved work. Confirm the existing Listing is retained.
7. **Rename:** Manage → Rename with a free disposable slug. Verify the same native ID/source/Listing and an atomic complete GitHub folder move. **Rollback:** choose an earlier complete revision; verify a new publication preserves current prompt/scratch and removes obsolete source files correctly.
8. **Offline/sync:** disconnect GitHub during an approved test Save. Verify the approved local snapshot remains stored and Sync pending appears. Reconnect and recheck; inspect a single coherent GitHub commit. Exercise source conflict choices only after Compare versions. Keep approved local and Publish GitHub version must respect the compared revisions.
9. **Restart/sign-out/recovery:** close/reopen the test browser and check saved state. Sign out and confirm native operations stop. Confirm session only after signing into the intended account. Tab loss, unknown Save, or an uncertain GitHub response should retain affected holds and offer reconciliation without duplicate writes.

`status.md` is exactly these three required plain fields (replace the example account with your manual label):

```text
account: alpha
action: publish_from_github
state: ready
```

The other valid action is `develop`; states are `ready`, `reserved`, `review`, `done`, `blocked`. A fresh repository needs an existing main branch. `main.pjs` and `main.html` are required for complete source; `src/` can be empty. New generators become Listed only after complete saved source is verified. AI Helper testing can consume the account's quota.

Report the first failing step, visible message, browser/Violentmonkey versions and relevant non-secret event/outcome. Do not paste PATs, cookies, session identity, private source or unsaved drafts. Leave an Unknown operation held until its outcome is checked.

## Build verification

`npm run build:operator-test` writes the enabled artifact; `npm run check:operator-test` checks profile, exact source/bundle reproducibility, metadata, version and payload. Unit tests exercise enabled/disabled builds and retained negative guards; browser checks run both artifacts on synthetic origins only. These are not native acceptance results. The pending live matrix remains in operator-qualification.md.
