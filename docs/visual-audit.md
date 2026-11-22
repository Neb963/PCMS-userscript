# P29 visual audit — 2026-11-22

P31 and native operator testing remain paused. This audit uses the production UI with synthetic records and effect-free services. It does not establish native Perchance or GitHub mutation qualification.

## Scope and method

- All eight routes: Overview, Generators, Reviews, Refresher, Settings, Utility, GitHub sync, Bulk Import.
- Chromium and Firefox screenshots plus geometry and interaction checks. Seven viewport sizes: 1440×900, 1024×768, 800×600, 760×620, 530×768, 320×568, 320×420. Both themes, reduced motion, and 150% text at desktop and mobile widths.
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
| Long account identity crowds navigation | Ellipsis with full-label title; navigation remains natively scrollable on narrow screens. |
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
