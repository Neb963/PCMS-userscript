# Active work — handoff

**Current phase:** P20 — Dedicated Refresher Save worker. **Status:** In progress.

## Next action

- Implement safe leading PJS/HTML PCMS comment markers, replacement/extraction and functional-source fingerprints over both panels and exact src bytes. Preserve baseline fingerprints at verified Import/publication so offline refresh can detect drift without GitHub.
- Add dedicated Refresher preparation/Save commands. Require hidden clean same-ID/owner draft and Listed source, preserve exact functional source/src, retain/read back the intended marker state, and use one acknowledged native Save plus independent source/Listing readback.
- Keep scheduling time in the Coordinator. Prepare first, then durably claim a paced attempt before Save, record failed/Unknown conservatively and move to tail. Proven pre-send skips do not count; uncertain writes hold only their generator.
- Reject stale/stopped/lost worker commands at the final native transport boundary. Never infer refreshed from clean editor, metadata time, functional match, missing marker, HTTP 200 or lost reply. No rank requests.
- Test marker syntax/BOM/CRLF/empty panels, source drift/missing baseline, dirty/selected tab, stale document, receipt failure/unknown, worker loss, queue continuation and no repeated Save. Run existing regressions. Keep live Save gate false until disposable Firefox/VM proof.

## Evidence

- P20 first verified batch: 164 Node tests PASS. Leading PJS/HTML markers preserve BOM/CRLF/empty panels and exact functional source/src, reject unsafe/malformed/moved/duplicate markers, and support baseline fingerprints at verified Import/publication. Native transport revalidates before dispatch, sends at most one matched request, bounds hung frontend calls and retains observed receipts. Dedicated Refresher preparation/Save/controller wiring remains to implement.

P00–P19 evidence is in docs/verification.md. Build/syntax and 158 Node tests PASS. P19 checks 44978381380 and Chromium/Firefox UI 44978381382 PASS at 54d8d7cd6c1834e78a700c720901f8ecd7161097. P01 live installation acceptance remains deferred.

## Blockers / deferred checks

DEFERRED — P01–P20 real Firefox/Violentmonkey injection/cache/disk, native receipt interception, retained draft/refresh Save and GitHub synchronization — no disposable profile/targets/PAT supplied. Static write flags remain false.

**Last pushed commit:** 54d8d7cd6c1834e78a700c720901f8ecd7161097.
