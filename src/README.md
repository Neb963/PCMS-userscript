# Production source

`entry.user.js` is the production entry and metadata. `npm run build` bundles its local named modules into one deterministic `dist/PCMS.user.js`. No runtime package dependency or simulated reference is included. Native and GitHub write gates remain disabled pending actual Firefox/Violentmonkey qualification.

Runtime/worker dispatch, persistent state, native/GitHub adapters, workflows, Refresher and UI have separate modules. See `ARCHITECTURE.md`, `docs/integration-matrix.md` and `docs/operator-qualification.md`.
