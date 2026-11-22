# P29 visual audit — 2026-11-22

P31 and native operator testing remain paused. This audit uses the production UI with synthetic records and effect-free services. It does not establish native Perchance or GitHub mutation qualification.

## Scope and method

Section 8 and all seven accepted v2.0.0 reference screenshots were reviewed. Existing route ownership, fixed headings and action footers remain the basis for this repair; simulation-only controls are absent from production.

- All eight routes: Overview, Generators, Reviews, Refresher, Settings, Utility, GitHub sync, Bulk Import.
- Chromium and Firefox screenshots plus geometry and interaction checks. Seven viewport sizes: 1440×900, 1024×768, 800×600, 760×620, 530×768, 320×568, 320×420. Both themes, reduced motion, and simulated 150% computed font/line height at desktop and mobile widths. This is a text-reflow stress fixture, not native browser-zoom qualification.
- Busy/long content; first setup, empty, loading, offline, unknown and import-result states. Fixture includes 54 generators, 18 development records, 45 queued Utility jobs, 72 events/attempts and 20 sync records.
- Manage drawers, Rename, Rollback revision picker, approval, repository-change confirmation, source comparison, long recovery and nested confirmation dialogs.
- Actual wheel scroll ownership, fixed heading, nominal desktop Settings fit, keyboard picker behavior, focus/scroll retention during store updates, updated listing/slug projections, source safeguards and disabled mutation gates.

The fixture is under tests/ui, never bundled into the production artifact. No live account, PAT or provider writes are used. The browser sweep saves screenshots and metrics as seven-day CI artifacts; screenshots are reviewed internally, not shipped in the install package.

## Defects and corrections

| Finding | Correction |
| --- | --- |
| Multiple Settings card scrollers; controls clipped in short layouts | Intrinsic shared grid rows, natural card bodies and one overflow owner for the Settings view. Narrow Connection / Controls & system views retain a single scroller. |
| Chromium grid tracks shrink and let subsequent cards overlap | Use content-sized grid tracks and nonshrinking cards. Preserve aligned top/bottom baselines. Hide empty status siblings so they do not reserve a gap and force a two-pixel desktop overflow. |
| Short Overview/Reviews acquire nested page/list scrolling | One content scroller in the constrained stacked layout; remove child scrolling there. Navigation and page heading stay fixed. |
| Short Refresher queue collapses under its status/header/footer | Compact short-screen controls; mobile Queue / Rate / Attempts panes stay usable. |
| Short import preview loses reachable content/actions | A single short-height content scroller, with the action footer retained. |
| Short inventory viewport shows only a fragment of its first row | Remove unused notice spacing and compact the narrow footer at short height. |
| Long account identity crowds navigation | Let the account label shrink before navigation, with ellipsis and a full-label title. Default desktop navigation fits; narrow navigation retains native scrolling. |
| Enlarged text spills from Manage column and timestamps | Font-relative action column, content-sized time column and wrapping page headings. |
| Raw state tokens and undifferentiated badges obscure outcomes | Human-readable presentation labels and contrast-checked state tones; canonical stored values unchanged. |
| Review Listing/slug can stay stale after a background update | Include both in row invalidation; preserve the focused action. |
| Utility detail update discards keyboard focus | Restore the equivalent action and detail scroll position after update. |
| Overview search/filter can retain an old scroll offset | Reset for new results; preserve scroll during background pulses. |
| Picker cancellation can leave focus on a value that was never selected | Reopen at the actual selected option. |
| Manage title can retain an old slug | Update dialog title, accessible name and close label together. |

## Verification

Final acceptance is recorded below after the complete built-script regression and strict screenshot sweep pass. Historical failing runs are retained as evidence of discovery, not passing acceptance.

- Baseline: 312328f1bd78dff41229e70130ca3847bcb45044, UI run 45054383271, 128 captures/browser. Confirmed nested scroll and collapsed short-screen regions.
- Intermediate sweeps: 45055304400 and 45055898403. The latter captured 216 scenarios/browser with no nested chains, horizontal page overflow or tiny regions, but its nominal built-script Settings check failed. That failure must be resolved before acceptance.

- Intermediate strict acceptance: 45056645315 at 349a00596e3686fc728eb2d3b14641d00a057901, 216 captures/browser, nested/horizontal/tiny/clipped/runtime errors all zero. Built-script nominal Settings fit failed with height 588 / scrollHeight 590; final fix removes the unused empty-notice gap. Final regression pending.

## Final acceptance

Verified implementation: `0e8747cf562f2500a5bcddf12f4301ce1f039401`, tree `a514449331639d163c321c39aa1a8435a1efea98`. Local and remote implementation trees match.

- [Synthetic checks 45057499016](https://github.com/Neb963/PCMS-userscript/actions/runs/45057499016): PASS.
- [Complete userscript and strict visual sweep 45057498921](https://github.com/Neb963/PCMS-userscript/actions/runs/45057498921): PASS, Chromium and Firefox. The final screenshots and metrics were downloaded and inspected. Desktop Settings, the 800px navigation boundary and short mobile inventory were checked again at full size; representative screens/states/dialogs were reviewed in contact sheets and targeted full-size views.

| Browser | Captures | Nested scroll chains | Unintended horizontal overflow | Tiny scroll regions | Clipped controls | Settings card overlap | Outer page overflow | Runtime errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Chromium | 216 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Firefox | 216 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

The strict sweep distinguishes intentionally scrollable navigation/filter strips from page overflow, and reachable content inside native scroll owners from controls clipped by hidden overflow. A tiny region means an active scroller below 28 CSS px. These checks and screenshots cover the named fixtures; they are not a proof for every possible native page or user configuration.

Both built-userscript regressions pass at 1440/1024/800/531/530/320px, with additional empty/setup and 320×420 checks. They verify Settings fit/alignment before expanded errors, staged forms, protected credentials, selection/scroll retention, keyboard interactions, source decisions, and existing safeguards. The separate strict sweep checks actual wheel movement without moving the page heading, card overlap, default desktop navigation fit, focus during store updates, changed listing/slug labels and picker cancellation.

Local `npm test` (266/266), `npm run build`, `npm run check:syntax`, `npm run check:bootstrap`, and `npm run check:candidate`: PASS. A clean committed-tree export builds exactly the working artifact. Candidate version 0.1.1, 460234 bytes, SHA-256 `c68120cc7956dde8e0e1909ee3d9f768eae57570209adeda3c4f61ec45f935e3`.

To reproduce: install the locked development dependencies and Playwright Chromium/Firefox, run `npm run build` and `npm run test:ui` for each browser, then `PCMS_AUDIT_STRICT=1 node tests/ui/visual-audit.mjs`; set `PCMS_UI_BROWSER=firefox` for Firefox. The screenshot workflow keeps artifacts for seven days; this report preserves durable acceptance facts.

P29 is accepted for the repaired synthetic visual/interaction surface. P31 and further native/operator testing remain paused. All five native mutation gates and the application GitHub write gate remain false. No live qualification was performed or claimed.
