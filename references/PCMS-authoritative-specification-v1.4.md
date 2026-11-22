# PCMS Userscript — Authoritative Specification

**Purpose:** PCMS is a small Firefox/Violentmonkey userscript for managing one Perchance account. It imports generators, reserves slugs, publishes source from GitHub, runs AI Helper development, supports manual editing and review, and refreshes Listed generators.

**Main priority:** Keep Listed generators online and Refresher running. One failed generator must not stop unrelated work. PCMS does not guarantee placement on Perchance's Recent page.

**Design rule:** Implement the simplest method that meets the requirements below. Do not introduce extra services, general workflow engines, separate account detection systems, or new UI destinations to solve hypothetical problems.

## 1. Account, setup, and browser

- Use **Firefox + Violentmonkey**. Each Firefox profile runs PCMS for **one independent Perchance account** and **one GitHub repository**. There is no central server, cross-profile coordinator, or shared account scheduler.
- On first setup, **the operator manually enters `account_id`**, repository URL, and GitHub PAT. **Never detect, invent, or change `account_id` automatically.** The operator can edit it until this profile starts managing its first generator (through Import or reservation). After that, lock it; use another Firefox profile for another account.
- **Confirm session** is a **manual operator confirmation** that the currently signed-in Perchance account is the intended account. Do not require automatic account identification or a separate identity service.
- Check that Perchance is signed in before native operations. Check a generator's ownership, native ID, and slug when available and relevant. If PCMS detects sign-out, a changed session, or failed ownership, pause affected native operations and show **Sign in required** or the specific mismatch. Ask for manual confirmation again. Do not automatically bind a different account.
- **Sign in** opens Perchance's normal login page on request. The UI remains usable while signed out; GitHub checks can continue. Never force a login or delete pending work on sign-out.
- Store the PAT and sensitive PCMS data in **Violentmonkey-controlled storage**, not in generator code, web-page variables, ordinary page storage, URLs, logs, or exports. Keep privileged GitHub requests and credentials outside untrusted Perchance page code. Use an isolated userscript context where supported. Accept only GitHub repository URLs with the exact `github.com` host; authenticated API calls go only to `api.github.com`.
- Keep credential entry simple. If a normal page input would expose the PAT to other page scripts, use an isolated Violentmonkey-managed entry method instead. Do not add a companion extension or server.
- PCMS operates while Firefox and its Coordinator are running. Browser suspension may delay work. Do not attempt to replay missed jobs on wakeup. The setup guide may explain `browser.tabs.unloadOnLowMemory=false` as an optional way to reduce tab unloading, without presenting it as a guarantee.

## 2. Tabs, coordination, and saved state

| Tab | Job |
| --- | --- |
| **PCMS** | Dedicated operator interface. Opens on Overview. |
| **Coordinator (role)** | One active controller per Firefox profile. Runs in an existing PCMS-managed tab; no extra user-facing tab is required. Checks GitHub, assigns jobs, and schedules Refresher. |
| **Refresher** | Dedicated background tab. Makes native refresh Saves, one at a time. |
| **Utility** | One worker for sequential reservation, import support, source publication, and native Rename. GitHub writes follow the same coordinated commit order. |
| **Development** | Up to **two running** AI Helper jobs, each with its own tab and draft. |
| **Manual editor** | Operator-authorized editing; no automatic Save into a dirty draft. |

- Use one cooperative **Web Lock** for the Coordinator and a saved term/job ID to reject duplicate or stale dispatch. The Coordinator may run in the PCMS tab or another running PCMS-managed tab. Worker messages use the privileged userscript channel, not a page-controlled event. The Coordinator sends GitHub commits one at a time and permits only one native write at a time per generator. Approval Saves remain in their original Development/Manual Editor tab. A Web Lock cannot cancel a request already sent to Perchance.
- When the Coordinator disappears, recover or replace it without dispatching the same unresolved operation twice. If an old native request may still finish, mark that generator's operation **Unknown** and inspect its result before retrying. Keep unrelated work running.
- Use one primary userscript-controlled persistent store for settings, job claims, holds, FIFO order, attempts, and **pending approved source snapshots**. Prefer Violentmonkey storage for protected data. Do not add a second database, encryption layer, or cross-store protocol without a demonstrated need. Read back saved source before relying on it; if the chosen storage cannot hold it reliably, stop the affected publication rather than bypassing the snapshot.
- **Before an approved Save**, store the whole approved source, target generator, original repository, and pending status update, then read it back. If it cannot be stored and read back, do not start that Save. Never treat a failed local write as a successful publication.
- Save a short job record **before** sending an external action. Record its outcome afterward. If Firefox closes between the two, recheck the remote result before repeating the action. A timeout does not prove that an operation failed.
- Keep a bounded activity history. Remove old routine records only when they are no longer needed for rate limits, pending recovery, or inspection. Do not automatically delete pending source snapshots, unresolved holds, or unsynchronized work to free space.
- Never move, reload, or focus an operator-selected tab automatically. Clicking **Review** or **Open editor** should activate its retained tab if Firefox allows it. Otherwise tell the operator which existing tab to switch to. Do not open a duplicate tab that might lose a draft.

## 3. GitHub files and control states

Each managed generator has one folder on GitHub `main`:

```text
/generator-slug/
  main.pjs                 # native Perchance PJS editor text
  main.html                # native Perchance HTML editor text
  src/                     # exact saved Perchance file tree; may be empty
  scratch/                 # AI Helper working instructions, not saved Perchance src/
    AGENTS.md
    design-specification.md
    to-do.md
  prompt.md                # AI Helper prompt
  status.md                # workflow instructions and state
```

**Complete source** means both editor texts and every saved `src/` path and its content. When publishing a complete source, remove obsolete `src/` files. An empty `src/` is valid; Git does not need `.gitkeep`. Both `main.pjs` and `main.html` are required for complete-source publication. If either is missing, block that publication; never clear a panel or publish only one panel. `src/` may be empty.

`status.md` has **exactly three required plain `key: value` fields** (no YAML frontmatter):

```text
account: alpha
action: develop
state: ready
```

| Field | Values |
| --- | --- |
| `account` | Manually configured owner ID for this generator |
| `action` | `develop` or `publish_from_github` |
| `state` | `ready`, `reserved`, `review`, `done`, `blocked` |

| State | Meaning |
| --- | --- |
| `ready` | Request work; PCMS queues it. |
| `reserved` | Account owns the exact slug; remaining work can proceed. |
| `review` | AI Helper finished; operator decision is needed. |
| `done` | Request closed with its saved source verified: published, or explicitly resumed unchanged after cancellation. Eligible **Listed** generators may refresh. |
| `blocked` | Work stopped, was cancelled, or needs operator resolution. |

- Reject missing, duplicate, or invalid required fields. Ignore unknown optional fields. Do not add states for refresh, local editing, or synchronization; keep those conditions in local PCMS records. On a manual edit, cancellation, or recovery update, retain the existing valid `action`. Bulk Import and Rollback explicitly set `action: publish_from_github`; if a folder has no valid `status.md`, repair or import it explicitly instead of inventing an `action`.
- **GitHub `main` is the source of truth for synchronized saved code.** A verified local approved publication takes temporary priority **for its generator** until GitHub synchronization finishes. Ignore only PCMS-owned inert refresh markers when comparing functional source.
- When Refresher checks a generator or Utility inspects it, compare saved functional source with the last verified GitHub version. Ignore PCMS refresh markers. If source changed **outside PCMS**, Utility may restore that GitHub version only when there is no active Edit/Development/Review draft, locally approved version, pending write, or source conflict. Keep the generator out of Refresher until restoration finishes; preserve its Listing. A restoration is a Utility Save, not a Refresher hourly attempt. If the cause or source is unclear, hold only that generator and let the operator use **Manage** to compare the versions, restore GitHub source, or explicitly keep the verified live source for synchronization. Never discard an unsaved draft or restore automatically under uncertainty.
- Use the same GitHub commit when updating a complete approved source and `state: done`. A status-only update may use a separate commit. Read all source files from **one `main` revision**; never mix different revisions.
- For GitHub writes, make **one commit for all changed source files**, including `src/` deletions. The Coordinator sends `main` commits sequentially. Update `main` only after checking for conflicting changes; never force-overwrite newer source. GitHub's Git Data API or another atomic commit method may be used internally. If GitHub returns an uncertain result, inspect the commit/history before trying again.
- Remember **which GitHub `ready` request** was claimed (repository, generator, relevant commit/change). Ignore the same stale `ready`/`reserved` request after a local completion or cancellation; a new explicit `done`/`blocked` → `ready` transition is a new request. If `prompt.md`, `scratch/`, or the request changes during unfinished local work, keep the current draft and hold the new request for comparison in **Reviews** or **Utility**, as appropriate. The operator may finish the current work or cancel it and accept the new request. Never overwrite a newer GitHub request with an old `done` or `blocked` update. If the assigned `account` changes, stop this profile's writes for that generator until the GitHub assignment matches again, or explicitly **Stop managing** locally. Source conflict choices in **GitHub sync** apply only when an approved local source actually exists. Do not add `status.md` fields or a separate request service.
- Validate generator slugs, GitHub paths, and file types before writing. Reject paths that escape the generator folder. Treat GitHub content as untrusted text in the PCMS interface; never execute code from source previews or diffs.

## 4. GitHub checks and automatic workflows

- Check GitHub `main` every **10 minutes** by default. The interval is editable. **Check now** starts a check without changing the schedule. Fetch changed content efficiently. When GitHub is unavailable, pause only work that needs GitHub; keep verified Refresher and already-started development/review work running.
- Use `account` from `status.md` to select requests for this profile's **manually entered `account_id`**. Automatically dispatch `ready` jobs and safely resume `reserved`; do not re-dispatch stale local completions or cancellations.
- Run Utility jobs **one at a time** and up to **two AI Helper development jobs** at the same time. Extra jobs wait in simple queues. After a verified Helper completion, free its running slot and retain its tab for review.

### 4.1 Bulk Import

- Discover existing owned generators from Perchance. Preselect eligible generators, allow deselection, and run **Import selected**.
- Import only their **saved** PJS, HTML, and `src/`, with `action: publish_from_github` and `state: done`. Do not Save, rename, relist, or replace a live draft during import.
- If a GitHub folder already exists, skip that generator and explain the conflict. Continue importing other generators. Listed imports may join Refresher; Unlisted imports do not.

### 4.2 Reserve a slug

- Check whether the account already owns the exact requested slug. Reuse its generator if owned.
- Otherwise create a generator with the native editor, record its native ID, make it **Unlisted**, rename it to the exact slug, and check the ID, owner, and slug before writing `reserved` to GitHub.
- Creation may briefly make a generator Listed; preventable zero-exposure is not a requirement.
- If the slug is taken, invalid, or cannot be verified, stop **that job**, record the local reason, and write or queue `state: blocked` for that request. Suppress its stale `ready` until a new request arrives; continue the queue. Never invent another slug or silently delete/recreate a temporary generator. Keep an accidentally created temporary generator **Unlisted**, show it in **Generators** as held, and let the operator open it, retry a verified rename, or **Stop managing** it in **Manage**. Stop managing never deletes it from Perchance.

### 4.3 Publish from GitHub

1. Take a matching `publish_from_github` request in `ready`, or safely resume its unfinished `reserved` request. Utility verifies or reserves the exact slug.
2. Hold the generator out of Refresher. Stage complete GitHub source in its native editor. Keep the Listing of an **existing generator** unchanged: Listed stays Listed; deliberately Unlisted stays Unlisted.
3. Save once and verify the saved PJS, HTML, and exact `src/` set. For a **new generator** made Unlisted during reservation, set it Listed **only after** the complete Save is verified; check Listing afterward. After an interruption, check the saved result before repeating any step.
4. Write `state: done` as a **status-only** GitHub commit. If GitHub is offline after a verified Save, record **Local done · Sync pending**, queue the status update, and restore Refresher eligibility **only if Listed** and otherwise allowed.

Do not use AI Helper or an approval screen for this workflow. Missing or conflicting source must not replace the current live version: write or queue `blocked` and wait for a corrected request. Existing Unlisted generators never become Listed without a separate explicit operator Listing action.

### 4.4 Develop with AI Helper

1. For an assigned `develop` request in `ready`, Utility verifies or reserves the exact slug sequentially and records `reserved`. For an unfinished, non-stale `reserved` request, recheck the reservation instead of creating again. Claim one of the **two Development slots** only when reservation is ready; hold the generator out of Refresher.
2. Keep an existing generator's saved Listing unchanged while AI Helper edits its draft. New generators remain Unlisted until approved. Do **not** automatically Save unfinished Helper work. Development starts from the generator's current **verified saved** Perchance source, after any needed safe source reconciliation. It does not first publish GitHub `main.pjs`/`main.html`/`src/`.
3. Require a present, non-empty `prompt.md`; block only that request when it is missing or empty. Copy any available `scratch/` instructions into the **AI Helper scratch workspace**, not native `src/`; an absent optional `scratch/` file is not an error. Send `prompt.md` **once** in one native Helper chat.
4. Wait for the **matching completed native Helper turn**: acknowledged submission, correlated fresh completion event, not stopped/errored/interrupted, unchanged draft identity, no active turn, and no queued Helper messages. An idle-looking UI or `delivery: delivered` alone is not completion. Unknown results require inspection, not resubmission.
5. On verified completion, set local `review`, write that state to GitHub when available, **release the Development slot**, and **keep the original tab** for the operator. Next queued development starts automatically.

Further manual AI Helper conversation may happen directly in the retained native tab. **PCMS does not implement follow-up prompts.** Those manual turns must not restart or change the finished automatic job.

**Cancel before Review:** A Queued job cancels without opening a tab and writes/queues `blocked`. A Running job receives a native Stop request and writes/queues `blocked`; retain its tab and any draft. Release the Development slot after Stop is confirmed, or after explicit operator **Abandon local run** when Stop cannot be verified. Abandoning frees the local slot but leaves that generator held until its remote result is reconciled. Never silently discard a draft or resend a prompt.

### 4.5 Review, approve, cancel

- Reviews shows **Review**, **Approve & Publish**, and **Cancel** on each row. **Review** opens the original retained tab, not a PCMS sidebar. The operator decides whether the source is acceptable.
- **Approve & Publish** requires explicit confirmation. Before Save, check that the retained draft is complete and Helper is no longer working; capture the approved source and confirm it has not changed since approval. Store and read back the full source first. Save in the **original Development tab** and verify complete saved source. Set **new reserved Unlisted generators** to Listed only after that Save is verified. Preserve the Listing of existing generators unless the operator separately changes it. Verify the intended Listing, then commit source and `state: done` together. If GitHub is offline, use §5. Return the generator to Refresher only when Listed and otherwise eligible.
- **Cancel** stops further automatic work and keeps the unsaved draft. It must not Save or delete that draft. The operator can later **Open retained draft**, or for an existing Listed generator choose **Resume saved version**: resolve/discard the draft, verify its previous saved source and Listing, clear the review hold, and write/queue a **status-only `done`** update for that request. This closes the request without publishing the rejected draft. If GitHub is offline, record the verified local resolution as **Local done · Sync pending** for the status-only update. A verified existing Listed version may resume Refresher immediately when no other hold remains; suppress stale `review` and `blocked` writes for the same request.
- A cancelled **new Unlisted** generator may instead **Discard draft & keep Unlisted**, ending the local review while keeping the generator out of Refresher. Cancellation writes/queues GitHub `blocked` and suppresses the same stale request; only a **new explicit `ready`** request starts new development.

### 4.6 Manual Edit, Rename, Rollback

- **Edit:** On explicit operator action, save a local Refresher hold before opening the native editor. Preserve its current Listing and unsaved drafts. **Publish manual edit** stores approved source first; Save in the **same Manual Editor tab**, verify source and unchanged Listing, then synchronize as in approved development while preserving the existing valid `status.md.action`. A verified Publish **ends the Edit session and releases its hold**, restoring Refresher only if Listed and no other hold remains. Do not clear the hold if Save is uncertain or the draft is still dirty. **End edit** separately lets the operator resolve or discard an unpublished draft and then release the hold. Cancellation alone never discards a draft. Further editing after successful Publish starts a new protected Edit session.
- **Rename:** Verify that the exact target slug and GitHub folder are free, then hold the generator out of Refresher. Rename natively, confirm unchanged ID and owner, then move its GitHub folder in one commit. If renamed outside PCMS, show the mismatch for the operator to resolve; do not silently move GitHub files.
- **Rollback:** Select an earlier GitHub revision by date. Commit its complete PJS, HTML and `src/` as a new source revision; preserve current `scratch/` and `prompt.md`. Set `action: publish_from_github`, `state: ready`, and run the normal Publish from GitHub workflow. Do not Rollback during an active Edit, Development, Review, or uncertain write. Rollback **preserves an existing generator's Listing**. If the operator separately chooses to make an Unlisted generator Listed, require explicit confirmation before that Listing change.
- **Exclude / Include:** Change local automation eligibility only; do not change GitHub source or Perchance Listing.

## 5. Offline approval and GitHub synchronization

- GitHub downtime must not stop **already prepared** development or prevent the operator from approving finished work.
- Before an approved native Save, persist and read back the **complete approved source**, native generator ID, Listing intent, original repository, and pending GitHub update. If storage fails, do not Save; keep the existing live version.
- Once native Save, complete source, and the **intended Listing** are verified, mark **Local done · Sync pending** when GitHub update is outstanding. Return the generator to Refresher **immediately if it is Listed and has no other hold**. Existing deliberately Unlisted generators can finish source publication and synchronization without entering Refresher. Synchronize automatically when GitHub returns.
- Existing locally approved versions remain protected from older GitHub source while pending. Unrelated `main` changes may coexist. If the same generator's approved source changed incompatibly, hold **only its GitHub synchronization**; keep independently verified local Refresher running. A changed workflow request or instructions during unfinished work is a **request conflict**, not automatically a source conflict. A changed `account` assignment also stops this profile's affected writes until it is corrected or locally unmanaged. Never resolve a request or account conflict by blindly choosing a source version.
- Show **Keep approved local** or **Publish GitHub version** only after comparing both sources. Never overwrite either version silently. Preserve Git history and use the ordinary publication workflow when publishing GitHub's version.
- Pending work stays tied to its **original repository**. When repository or PAT settings change while work is pending, show that work and require confirmation. A **PAT-only change for the same repository** uses the new PAT for its pending updates. A **repository change** retains the original repository and its working credential only as long as pending work needs them; the operator may resolve, explicitly reassign, or stop managing that pending work. If original access fails, keep the source snapshot and show a recovery action. Never silently retarget, dual-write, or discard approved source.
- Never repeat a GitHub commit when its outcome is unknown. Inspect current history and source first. A remote failure on one generator must not stop other generators or Refresher.

## 6. Refresher — pure FIFO

Only managed **Listed** generators with a verified saved version and `done` or verified **Local done · Sync pending**, and without a relevant local hold or exclusion, are eligible. **Resume saved version** closes a cancelled review with a status-only `done` update before restoring eligibility. Do not use weights, Recent-page measurements, rankings, or quality scoring.

| Setting or value | Rule |
| --- | --- |
| `max_total_refreshes_per_hour` | Operator-editable maximum of native Save **attempts** per rolling 60 minutes. |
| `total_generators` | Read-only current eligible count (`n`). |
| `max_generator_refreshes_per_hour` | Read-only `ceil(M / n)` when `n > 0`, where `M` is the account-wide limit. |
| Average per-generator interval | Read-only `n / M` hours under continuous operation. |
| Average per-generator rate | Read-only `M / n` attempts/hour. |

- Space account Save slots by `60 / M` minutes and respect both rolling-hour caps. Changing a cap does not clear existing attempt history. Show `—` when `n = 0`.
- Maintain one FIFO queue. On each available slot, check at most one full pass from the head. If a generator becomes ineligible, remove it from the active queue until it is eligible again. **Append newly eligible and returning generators to the tail.** If it has reached its hourly cap, **move it to the tail and inspect the next one in the same slot**. If none is available, wait; do not spin or consume a Save attempt.
- For an eligible generator, change only PCMS-owned **inert refresh markers** in PJS and HTML, perform **one native Save**, record the attempt, and move the generator to the tail. Refresh markers must not change functional code. Do not use a marker form that breaks the native editor syntax.
- A failed Save **counts** toward the limits and moves to the tail, with **no immediate retry**. An ordinary failure does **not** permanently exclude a generator or trigger an arbitrary three-failure circuit breaker. Keep the next slots running.
- If a Save times out or its remote outcome is unknown, count it conservatively and hold **only that generator** until checked; do not automatically repeat it. A unique marker per attempt can help identify a landed Save, but missing marker is not by itself proof that Save failed.
- Never overlap Saves in the Refresher tab. Pause/Resume preserves queue order and history. A browser restart, clock change, or delayed timer must not cause catch-up Saves or an account-wide burst. Use existing attempt records when deciding eligibility.
- Keep failed attempt details in Recent activity; do not turn ordinary refresh failures into GitHub `blocked` workflow states.

**Example:** 300 eligible generators with `M = 30` attempts/hour receive approximately one attempt per generator every 10 hours, subject to skips and browser availability.

## 7. Failures, cancellation, and recovery

**Rule:** A failure affects only the generator or worker that needs attention. Keep unrelated jobs and verified Refresher running. Do not retry an operation that may already have succeeded.

| Situation | PCMS behavior | Operator's next step |
| --- | --- | --- |
| Signed out or login changed | Pause native owner operations; retain local work. | Sign in and manually **Confirm session** again. |
| Slug unavailable | Block this request; skip it and keep temporary generator Unlisted. | Check slug or send a new `ready` request. |
| AI Helper stopped or result unknown | Do not mark `review` or resend the prompt. | Inspect/recover the original tab, or explicitly abandon the local run. |
| Running Development tab lost | Keep the draft/uncertain result held; free its local slot only after explicit stop/abandon. | Recover tab or abandon the local run without claiming remote completion. |
| Review cancelled | Retain the draft and hold Refresher until the operator resolves it. | Open retained draft; for existing Listed source, **Resume saved version** and queue `done`; for a new Unlisted source, discard the draft and keep Unlisted. |
| Save result unknown | Hold only that generator's affected writes. | Recheck native saved source and Listing; do not blind retry. |
| GitHub offline | Queue needed GitHub update; keep independently verified local work running. | Reconnect; synchronize automatically. |
| GitHub source conflict | Preserve both versions and continue safe local Refresher. | Compare and explicitly choose a source in **GitHub sync**. |
| GitHub request or account conflict | Protect the current draft and do not overwrite a newer request or different account assignment. | Inspect the current request in **Reviews** or **Utility**; continue or cancel local work. For changed account assignment, correct GitHub ownership or **Stop managing** locally. |
| External saved-source change | Hold only this generator until a safe source is verified. | **Manage** compares the live and GitHub versions; restore GitHub source or explicitly keep the live version. |
| Previously Listed now Unlisted | Remove it from Refresher; keep intended Listing. | Recheck or confirm intentional Unlisting. |
| Generator missing or renamed outside PCMS | Do not infer deletion or silently change GitHub identity. | Recheck inventory, confirm deletion/stop managing, or resolve rename. |
| Storage failure | Do not start an approved Save without its stored source. | Repair storage; recover pending work before repeating effects. |
| Temporary Unlisted draft abandoned | End local work without publishing. | **Discard draft & keep Unlisted** after confirmation. |
| Slug reservation created a temporary generator | Keep its ID and Unlisted state; do not create another automatically. | Open it in **Manage**, verify Rename, or **Stop managing** without deleting it. |

- A generator can have multiple independent reasons for being held. Resolving one must not clear the others. Show the relevant next action in **Manage**, **Reviews**, **Utility**, or **GitHub sync** according to the cause; do not add a separate recovery screen or a generic **Resolve** that cannot complete the repair.
- On cancellation, preserve the original GitHub request identity until a later new `ready` is verified. `blocked` is a public workflow state; local reasons belong in local PCMS state.
- If a remote operation may have happened before a crash, inspect the remote result first. If the result cannot be established, keep it **Unknown** and offer a safe stop-managing choice; do not claim that stopping locally deletes or undoes a remote effect.
- Use short, clear error text: what happened, what is still safe, and what the operator can do next. No generic Force Continue.

## 8. Accepted UI/UX

**Purpose:** One task, one destination. Help the operator see what needs attention and finish a task with as few steps as practical. Every visible element must show useful state or support a real action. Keep the approved v2.0.0 design; do not add screens, metrics, or controls for decoration.

### 8.1 Entry, navigation, and screen ownership

- PCMS runs in one dedicated browser tab. Open it from Perchance or the Violentmonkey command. The default screen is **Overview**. Keep native editing and AI Helper work in their own Perchance tabs.
- Use horizontal top navigation: **Overview**, **Generators**, **Reviews**, **Refresher**. Put the **Settings** icon and theme control on the right. Highlight the active destination; do not add a sidebar or breadcrumbs. The latest approved mockup uses this layout, replacing the earlier five-text-tab proposal.
- **Overview** is the home for unresolved actions, worker status, and event history. **Generators** owns inventory and generator management. **Reviews** owns approval and the development queue. **Refresher** owns its queue and rate settings. **Settings** owns configuration and diagnostic export.
- **Utility** and **GitHub sync** are subviews reached from the relevant Operations row. Their **Back** action returns to Overview. They are not new main tabs. Contextual links may open a task's existing destination; they must not create another implementation of that task.
- Automatic work never changes the active tab or selected window. **Review** and **Open editor** try to activate the original retained Perchance tab only after an operator click. If activation is unavailable, show which tab to switch to; do not open a replacement that might lose an unsaved draft.

### 8.2 Overview: three clear columns

- On wide desktops (at least **1160 CSS px**), fill the space below navigation with **three side-by-side, equally aligned columns**: **Requires action | Operations | Recent activity**. Panels fill the available height, but their rows stay at the top at natural height. Never stretch a few rows, add placeholders, or leave a separate empty footer band.
- Use two columns on intermediate widths and stack the sections on narrow screens. Keep the heading and controls stationary. Long lists scroll inside their own panels; the desktop page must not acquire another scrollbar.

**Requires action**

- Derive cases from current unresolved state, not journal entries. Show one case per native generator ID when known. For requests without a native ID, use repository plus requested slug; account-wide problems have their own row. Keep every active cause, show the highest-priority cause in the row, and expose the other causes in its **existing destination**.
- Sort by the following fixed priority. Use the stated action to open the existing workflow, not a generic panel that cannot resolve it.

| Priority | Condition | Action |
| --- | --- | --- |
| 0 | Signed out, session unconfirmed, wrong account, or storage unavailable for the profile | **Sign in** / **Confirm session** / **Settings** |
| 1 | Generator unexpectedly Unlisted when intended Listed | **Manage → Resolve Listing** |
| 2 | Unknown native/Helper write, lost generator, or target snapshot failure | **Manage → Recheck result** / **Reviews** |
| 3 | Conflicting GitHub source, request, account assignment, or external live-source drift | **GitHub sync**, **Reviews**, **Utility**, or **Manage**, according to the cause |
| 4 | Unavailable slug, invalid request, cancelled Review with retained draft, or another blocked job | **Utility** / **Reviews** / **Manage**, according to the cause |
| 5 | Completed development awaiting approval | **Review** |

- Count distinct unresolved cases for the **Overview** navigation indicator, before grouping display rows. Group two or more ordinary review cases as **N awaiting review** by default; expanding them does not change the count. Do not merge unrelated safety problems into one anonymous row.
- Each row needs only the issue, generator or affected scope, its consequence, and one clear action. **Manage** owns Listing, native Save, external rename and stop-managing decisions; **Utility** owns failed reservations/publication; **Reviews** owns Helper, retained drafts and cancellation; **GitHub sync** owns approved-source conflicts and pending old-repository updates. Individual **Review** activates the retained tab; grouped reviews open **Reviews**. Rechecking, a toast, or closing a panel never clears a case.
- While state is being restored, show **Checking saved state…** and an unknown action count. Only a verified empty set shows **No action required**. Routine refresh failures and ordinary GitHub sync pending do not become manual tasks unless a real decision is needed.

**Operations**

- Show exactly four operation paths: **Refresher**, **AI Helper**, **Publication** (Utility worker), and **GitHub sync**. Each row has a concise status, a useful count or constraint, and **Details/Open** to its existing screen.
- Display coordinator status as **Verified**, **Checking**, or **Unverified**. When unverified, worker status is **Unknown**, not Running or zero. Show **Paused**, **Offline**, **Local done · Sync pending**, and **Failed** only when they describe different actual states. Never invent completion percentages or times.
- A signed-out account pauses Perchance work but not independent GitHub checks. A GitHub outage does not make a verified local Refresher look failed. Opening Operations details does not start or retry work.

**Recent activity**

- Show **three** meaningful events by default. Present each as one compact, full-width row with balanced title and time; no repeated details or decorative icons.
- Aggregate comparable **confirmed Refresher Saves** into a summary count, while keeping the individual events in history. Do not merge failures or uncertain outcomes into successful summaries.
- **Show all** expands history **inside the same column**. Provide search, **All / Warnings**, read-only event details, **Export journal**, and **Load older** after each batch of **100** events. Keep the history list internally scrollable. Event IDs, journal sequence, and generator identity remain stable when new events appear or a slug changes.
- A journal entry is history, not current health. Show **No activity recorded** only for a known empty journal; otherwise show **Checking saved events** or **Journal unavailable**.

### 8.3 Generators: inventory and selection

- Use a full-width desktop inventory with one row per native generator ID. Show **Listing**, **Workflow**, **GitHub**, and **Refresher** as four separate states. Do not relabel a GitHub conflict as a failed workflow or a local exclusion as Unlisted.
- Search by slug or native ID. Filter by Listing, Review, Held, Sync issues, and Excluded. Sort deterministically by slug, workflow, or native ID. **Manage** opens the generator drawer; viewing a row never writes to Perchance or GitHub.
- **Select visible** affects the current filtered list only. Selection persists when filters change; the total count includes hidden selected rows. Show an indeterminate checkbox for mixed selection. **Clear selection** changes only selection, never generator state.
- Keep search, filters, selection controls, and bottom count fixed while **only the inventory list scrolls**. Desktop selection controls use the existing filter row; on narrow screens use the accepted bottom selection bar. Selecting or clearing a checkbox must not push the inventory down or reset its scroll position. A new search, filter, or sort starts its new result list at the top.
- On mobile, show the slug/native ID and **Manage** first; place the four states below. Do not hide the main action behind horizontal page scrolling. Use the same app-styled checkboxes in both themes.
- Generator bulk actions are **Exclude selected** and **Include selected** only. Show one confirmation and recheck each selected generator before applying; report partial results without pretending every selected item succeeded.

### 8.4 Bulk Import

- Open Bulk Import from **Generators**, retaining the same page heading position and top navigation. The list shows generators discovered for the current account, with eligible **Ready** items preselected. Disabled or conflicting items show a short, specific reason; never preselect unverifiable items.
- Search and filtering do not clear hidden selections. Keep the heading, search, filters, selection count, and **Import selected** footer stationary. **Only the candidate list scrolls**, including on narrow screens; reaching Import must not require scrolling the whole page.
- **Import selected** is one explicit action. Keep the existing generator unchanged. Recheck each candidate, show independent outcomes, and never silently overwrite a GitHub folder or retry an uncertain write.
- Results show one heading, compact counts, and processed generators first. **All** reveals skipped entries. Each row shows its outcome and only a useful next action; keep repeated explanations in optional detail, not permanent text.

### 8.5 Manage: one generator at a time

- **Manage** opens one drawer showing Listing, Workflow, GitHub, and Refresher state first. Under them, show only actions valid for that generator. Do not create a separate full-page editor inside PCMS.
- **Edit** saves a local edit hold before opening the native editor. **Open editor** opens that retained tab on request. **Publish manual edit** saves only the approved current source, preserves existing Listing, and ends the Edit hold **after verified Save with no dirty draft**. **End edit** resolves a draft without publishing and then releases the hold. Cancelling a confirmation keeps its hold. New edits require a new protected Edit session.
- **Rename** validates the exact slug, owner, native ID, and conflicting work before changing anything. **Rollback** selects a complete earlier GitHub revision and queues the normal Publish from GitHub workflow; it does not immediately replace live source or change an existing generator's Listing. **Exclude / Include** changes local eligibility, not Listing or GitHub source. With a relevant hold, **Manage** also offers only the needed **Resolve Listing**, **Recheck result**, **Resolve rename**, **Compare saved source**, or **Stop managing** action. Temporary Unlisted generators appear here for recovery.
- Use short action names and a single focused confirmation for consequential changes. Hide actions that are unavailable in a review/conflict state; disable relevant actions while a job is running. A source conflict opens **GitHub sync**; a completed AI Helper run belongs in **Reviews**. Closing the drawer is read-only.

### 8.6 Reviews and development queue

- Keep the screen fixed below the top navigation. Desktop has two columns: **Awaiting review** and **Development**. In Development, show at most **two Running** jobs above the **complete Queued** list, with no artificial gap between them. Only the review list and queue scroll. There is no **Show more / Show less** control.
- Each review row shows the generator identity, saved Listing state, and three adjacent actions: **Review**, **Approve & Publish**, **Cancel**. **Review** goes straight to the retained native tab; it does not open a PCMS drawer.
- **Approve & Publish** uses a focused confirmation of the current, settled draft. It ends Review automatically **only after** the complete Save and intended Listing are verified. An uncertain Save leaves the hold. A GitHub outage leaves the verified approved version locally done and its GitHub update pending.
- **Cancel** preserves the draft and provides a reachable recovery path. For a previously Listed generator, offer **Open retained draft** and **Resume saved version** after draft resolution. For a new Unlisted generator, offer the retained draft, an explicit discard/keep-Unlisted choice, or a later new `ready` request. Never show **Resume saved version** when no saved Listed version exists.
- Running and queued jobs have **Cancel** with confirmation: Queued cancels without a native Helper turn; Running requests Stop, retains the tab/draft, and releases its slot only when stopped or explicitly abandoned. Where necessary the row offers **Recheck result** or **Abandon local run**, keeping uncertain results held. Both cases write/queue `blocked`; neither repeats a prompt. A completed Helper job releases its execution slot while retaining its review tab; manual Helper follow-ups take place in Perchance, not in a new PCMS interface.
- On narrow screens, stack the two columns while keeping actions reachable and list scrolling internal. If a retained tab is unavailable, show the specific recovery action instead of opening another tab blindly.

### 8.7 Utility: reservation and publication progress

- Open from **Overview → Operations → Publication → Open**. Show two compact panels: the **single Utility worker and its complete job list**, and **steps for the selected job**. Selecting a job is read-only and never dispatches or retries it.
- For slug reservation, show: request checked → slug checked → generator created or reused → new generator Unlisted → identity checked → GitHub `reserved` confirmed.
- For Publish from GitHub, show: request/source checked → slug reserved → complete source staged → native Save → saved source checked → **intended Listing confirmed** → GitHub `done` committed (or pending when offline). Only new generators are automatically set Listed; existing Unlisted generators remain Unlisted.
- Mark a step **Verified** only after its result is known; a queued or unverified job has no invented progress. Keep the heading fixed; only the job list or detail area scrolls as needed. Narrow layouts stack without adding a second page scrollbar.

### 8.8 Refresher: queue, limits, and attempts

- Keep the accepted two-column desktop layout, with the **whole eligible FIFO queue** on the left and compact **Rate / Recent attempts** on the right. Use one short status line, not four large metric cards. Only the queue and attempt history scroll.
- Show the next eligible generator and last result. **Eligible / Not eligible** switches between active FIFO members and generators excluded by Listing, a hold, exclusion, or other rule. Not eligible rows show the reason and a **Manage** action. Do not truncate the queue to 12 entries.
- Provide one editable hourly Save-attempt limit, as an integer from **1 to 3600**. Show read-only eligible count, rolling-hour used/cap, per-generator cap `ceil(M/n)`, estimated rate `M/n`, and estimated interval `n/M` hours. For `n=0`, show **—**. Use actual attempt history for the next slot, not a fabricated estimate. Invalid input leaves the applied cap unchanged.
- **Pause / Resume** preserves FIFO order and attempt history; Resume does not catch up. Show failed Saves as attempts without immediate retry. Unknown Saves make only the affected generator ineligible until recovery. An unverified worker shows **Unknown** and a cached queue only as a snapshot.
- At widths **530 CSS px or narrower**, show **Queue / Rate / Attempts** tabs with one usable pane at a time. Do not create three tiny scroll areas or an outer page scrollbar.

### 8.9 GitHub sync: compact source decisions

- Open from **Overview → Operations → GitHub sync → Open**, or a relevant case in Requires action. **Settings → Sync pending → Open** may link to the same view. No additional main navigation item.
- Desktop has **Jobs** and **Source & decision** panels. The Jobs list shows all pending, synced, conflicted, and uncertain records with concise counts. The details panel shows original repository, generator ID, **Local / Refresher / GitHub** states, one short explanation, and source revisions **only when a conflict needs comparison**.
- Put longer verification steps inside an optional **Verification evidence** section. Place **Compare versions** and the applicable confirmed source choices in a fixed footer, always visible without scrolling at standard desktop height. The default desktop details must not scroll at **768 CSS px height or more**. Only the Jobs list scrolls when needed. On short mobile screens, detail content may scroll while its action footer stays visible.
- A **source conflict with a verified approved local version** provides **Keep approved local** or **Publish GitHub version** after comparison and confirmation. Both source choices preserve Git history and protect the approved live version until any new Save is verified. A **GitHub-write Unknown** offers recheck, never blind retry. Changes to `prompt.md`, `scratch/`, or the workflow during unfinished development are handled in **Reviews** or **Utility**: the operator can keep the current local work or cancel it and adopt the newer request. A different `account` assignment cannot be overridden here; fix it in GitHub or **Stop managing** locally. Pending work tied to an old repository offers explicit **Reassign** or **Stop managing** after confirmation.
- At **850 CSS px or narrower**, use **Jobs / Details** tabs. Keep offline, pending, conflict, unknown, snapshot failure, and unavailable states visibly distinct. Sample-record pickers and **Example states** are mockup-only; production must never substitute demo records for an empty inventory.

### 8.10 Settings: compact and aligned

- **Settings** opens from the top-right icon. On desktop use the approved two-column grid: **Perchance account** and **GitHub** on the left; **Automatic checks**, **Interface**, and **System** on the right. Share grid rows so Account and Automatic checks align, and GitHub and System finish on the same baseline. Do not use empty filler panels, individually tuned card heights, or overlapping footers.
- Account setup shows the **manually entered `account_id`**, **Sign in**, and **Confirm session** as separate controls. The ID can change before onboarding and is locked after the profile manages generators. Missing binding shows **Setup required**; sign-out shows **Sign in required**.
- GitHub changes use **Test → Apply**. Editing the candidate invalidates the previous Test; a failed Test leaves working settings unchanged. Changing **repository or PAT while work is pending** requires confirmation listing that work. Pending work remains tied to its original repository unless explicitly reassigned; a PAT change for the same repository uses the new PAT. Cancelling keeps the previous working settings. The PAT stays masked and never appears in diagnostics.
- **Automatic checks** has an integer polling interval of **1–1440 minutes** and a **Check now** control placed on the same aligned row as **Last GitHub check**. Show results only when known, not from a button click alone.
- **Interface** offers light/dark theme. **System** shows six compact, read-only operational counts and shortcuts to the canonical screens. **Export diagnostic** appears here only. Developer preview, sample-state controls, and other simulation tools belong to the mockup and are absent in production.
- At normal desktop size (**1024×768 CSS px or larger**, default zoom and font size, with no expanded errors), neither column nor the page should scroll. At **760 CSS px or narrower**, use **Connection / Controls & system** views. Short screens, larger text, browser zoom, and expanded errors may scroll inside the affected pane so no control becomes unreachable.
- Developer preview in the mockup opens a separate accessible dialog, never expands beneath System or pushes buttons off-screen. Editing a form must not lose focus, clear uncommitted input, or shift the heading.

### 8.11 Shared layout, controls, and interaction rules

- **Stable headings:** Use one shared page-header layout. At a fixed viewport, zoom, and theme, title left/top position and height remain within **2 CSS px** across the main screens and subviews, including Bulk Import preview/results. Back belongs in the trailing header action area, not above the title; do not add breadcrumbs or different route-specific offsets.
- At normal desktop width (**781 CSS px and wider**), use **28 px** side gutters, **24 px** top inset, a **24/30 px** heading, and a **58 px** minimum header. At **780 CSS px and narrower**, use **11 px** gutters, **16 px** top inset, a **22/28 px** heading, and a **53 px** minimum header. Allow reflow at larger zoom or font settings instead of clipping content to meet a pixel target.
- **Scroll ownership:** Keep top navigation, page headings, filters, and fixed action footers visible. A panel scrolls only when its content actually overflows. Avoid nested or double page scrolling. Preserve the position of a list after checkbox changes; scroll to the start of new results after search/filter/sort.
- **Controls:** Use one shared custom-styled picker for dropdowns and app-themed checkboxes. Theme visible scrollbar tracks/thumbs in both light and dark modes, but **keep native scrolling** for wheel, touchpad, touch, and keyboard. Do not implement fake scrollbars or drag logic.
- **Keyboard:** Dropdowns have accessible names; support Enter/Space, Arrow keys, Home/End, Escape, and Tab. Opening a dropdown does not select an item or move the page. Modal dialogs trap Tab; Escape/backdrop close only the topmost dialog. Closing returns focus to the triggering control; a nested confirmation closes without dismissing its parent drawer. The `/` search shortcut does nothing while editing text or using a modal/picker.
- **Visual clarity:** Prefer compact rows over decorative metric cards and long explanatory paragraphs. Use one readable typography scale, aligned spacing, consistent action labels, clearly visible hover/focus/disabled states, and no near-invisible dark-button hover. Normal text contrast is at least **4.5:1** on its background. Support light/dark themes and reduced-motion preferences. At **320 CSS px**, navigation and all essential actions remain reachable, with intentional horizontal scrolling only for narrow tab/filter strips.
- **State and input safety:** Loading, empty, unavailable, successful, failed, and Unknown states look distinct. Never label a cached worker or unconfirmed account as Verified. Disable only the actions affected by an in-progress change, so rapid clicks cannot start it twice. Rerenders, toast expiry, navigation, and filters must not discard uncommitted form values or release a hold.
- **No duplicate notifications:** There is no bell, notifications screen, dismissible notice store, or second journal. Use Requires action for live cases, Recent activity for history, and Settings for diagnostic export. Short nonblocking toasts can acknowledge operator actions but never change operational state.
- **Export safety:** Journal and diagnostic exports use only the fields needed to inspect status, event IDs, native IDs, counts, and known reasons. Never include PATs, cookies, session identity, repository URLs, complete source, unsaved drafts, prompts, arbitrary error text, or generator slugs.

**UI completion check:** Walk through first setup, import, development, approval/cancellation, manual Edit, Rename, Rollback, routine refresh, GitHub offline/conflict, sign-out, tab loss, and uncertain Save. Each visible action must open the intended screen, preserve protected work, and show a clear next step. Verify desktop, narrow screens, both themes, keyboard focus, long lists, and empty/unknown states in Firefox. The accepted mockup is the visual reference; it does not by itself perform real Perchance or GitHub operations.

## 9. Implementation checks

These are **practical checks while building**, not a separate approval system or a change to the product scope. Each real action must work in Firefox/Violentmonkey before it is enabled for normal use.

- Manual `account_id` and Confirm session work. Sign-out pauses native operations without stopping GitHub inspection.
- A real Perchance inventory/import uses the correct generator and saved source without modifying its live Listing or draft.
- New generator reservation uses the requested slug and preserves its native identity. A new generator is Listed only after its complete saved source is ready.
- GitHub commits contain complete source, including deletions; old or conflicting requests cannot overwrite a newer version.
- AI Helper Stop, errors, and unknown completion cannot become Review. Manual follow-ups never start automatically. Approve checks the current settled draft.
- An approved Save survives GitHub downtime and restart through its saved local snapshot; verified local Refresher continues.
- FIFO order, rolling caps, failed/unknown Saves, and Pause/Resume behave as specified. One failing generator does not delay the rest.
- Cancelling, losing a tab, changing a repository, or interrupting a write has a clear recovery path. No blind duplicates, lost drafts, or unrelated holds.
- Account credentials stay out of page-visible state and exports. All accepted layouts and keyboard paths work in Firefox.

**Build incrementally.** Test a capability on disposable generators before using it on live ones. Keep the previous working userscript and saved local work available when updating PCMS. Do not change the product scope just because a test finds a problem; first fix the smallest affected operation.

## 10. Terms

| Term | Meaning |
| --- | --- |
| **Account / `account_id`** | Owner label entered manually by the operator for this Firefox profile. |
| **Native ID** | Perchance's generator identifier, distinct from its slug when available. |
| **Slug** | Exact generator URL name. |
| **Listed / Unlisted** | Perchance directory visibility, separate from code and GitHub workflow state. |
| **Complete source** | PJS panel + HTML panel + exact saved `src/` files. |
| **Coordinator** | One per-profile controller of queues and scheduling. |
| **Utility** | Sequential worker for reservation and publication. |
| **Development slot** | One actively running automatic AI Helper job; a waiting Review does not use a slot. |
| **Local done · Sync pending** | Approved source Saved and Listed on Perchance, awaiting GitHub update. |
| **Hold** | Local reason that pauses only the relevant generator or operation. |
| **Unknown** | The result has not been verified; neither success nor failure can be assumed. |
| **Refresher** | Dedicated worker that Saves generators in pure FIFO order. |
