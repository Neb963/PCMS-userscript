# Perchance discovery

This reference defines the Perchance interfaces and behavior that PCMS uses. The PCMS product specification defines workflow, scheduling, and operator controls.

| Term | Meaning |
|---|---|
| Slug | The generator name in the URL and API field `name`. A rename changes the slug. |
| Generator ID | The server field `id`. It identifies the generator across a rename. |
| Public ID | The separate identifier `publicId`, also exposed as `window.generatorPublicId` where available. |
| PJS | The lists-panel source. The API field is `modelText`. |
| HTML | The HTML-panel source. The API field is `outputTemplate`. |
| `src/` | Files that belong to the generator. The saved manifest maps their relative paths to stored files. |
| Complete source | PJS, HTML, and the exact paths and bytes of all saved `src/` files. |
| Listed / Unlisted | The generator's directory setting. `isPrivate: false` means Listed. `isPrivate: true` means Unlisted. |
| Draft | A local editor workspace with its own panels, file changes, and AI Helper association. |

## 1. Origins and interfaces

| Origin | Role |
|---|---|
| `https://perchance.org` | Generator pages, editor, account, directory, and generator APIs. |
| `https://<sandbox>.perchance.org` | Generator output and preview. The sandbox hostname can change. |
| `https://ai-agent.perchance.org` | Native AI Helper sessions, message delivery, and event stream. |
| `https://upload.perchance.org` | Upload verification, the upload page, and the embedded uploader. |
| `https://user.uploads.dev` | Stored file bytes under `/file/<key>`. |

Use the public HTTP interfaces for public reads. Use the native editor for Save, local source changes, and AI Helper controls. The editor coordinates draft state, upload preparation, concurrency checks, and follow-up requests. A direct HTTP call does not run those client actions.

The `window` objects and selectors in this reference belong to the Perchance frontend. Check that each required interface exists in the current document before using it. Use the top-level editor for account and source operations. The output iframe runs on a separate origin. Use the native preview bridge for communication with it. Check the message source and match replies to the request.

## 2. Page navigation and editor readiness

| URL or action | Behavior |
|---|---|
| `/<slug>` | Opens the generator in view mode. |
| `/<slug>#edit` | Opens the editor on a document load. Changing only the hash does not open the editor. |
| `/minimal#edit:new` | Opens the `minimal` template for creation. The first fork Save creates the generator. The page can normalize the hash to `#edit`. |
| `app.goToEditMode()` / `app.goToViewMode()` | Changes the current page mode. The hash can stay unchanged. |
| `/generators` | Opens the public directory. The page can add cards and apply its own display order. |
| `#edit:collab=<key>` | Opens a collaborative editor when the key is valid. |

Before an editor action, wait for `app.data.generator`, `modelTextEditor`, `outputTemplateEditor`, and `srcState`. Use `loadAppExtras()` when the page exposes it and the action needs the editor extras. Wait for `srcState.ready()`. Check `__editorReady` and `__draftChoiceSettled` where the page exposes them. A pending draft choice blocks the action.

Check `currentInterfaceMode` or the native interaction state for the current mode. A loaded URL and the presence of editor elements alone do not establish readiness. Check the generator ID, slug, and owner again after navigation, a rename, or a reload. Wait while the native identity transition or a Save is in progress.

| Editor action | Native control |
|---|---|
| Save | `[data-ref="saveButton"]` |
| Settings | `[data-ref="settingsButton"]` |
| Backups | `[data-ref="revisionsButton"]` |
| Listing | `[data-ref="listingButton"]` |
| Account or sign-in | `[data-ref="accountButton"]` or `[data-ref="loginButton"]` |

Select controls within their native panel. Check that the control is visible and enabled. Use an ID or `data-ref` where the page provides one. Settings and backup controls depend on edit mode and the owner session.

### Slug classification

Read the top-level generator URL. Use the exact site message for Available or Reserved after normalizing layout whitespace. Ignore scripts, styles, and templates when reading the visible page text.

| Classification | Required signal |
|---|---|
| Available | `(⊙.⊙) sorry, we cannot find a generator with that name! create one?` |
| Reserved | `(⊙.⊙) sorry, this is a reserved name - had to do this because a few users where "name-squatting" on lots of common words and not actually using them ¯\_(⊙_ʖ⊙)_/¯` |
| Taken | Positive generator content. A matching saved-source response identifies the generator. The PCMS Discover contract also requires valid rendered output where applicable. An iframe shell alone is insufficient. |
| Unknown | Challenge page, timeout, missing output, changed message, or contradictory signals. |

An HTTP status alone does not establish availability. Recheck an Available slug immediately before creation or rename. Availability does not reserve a slug. The native rename form normalizes input to a lowercase slug. It requires at least four characters for ordinary names. The server determines reserved names. Confirm the final slug exactly.

## 3. Account, ownership, and generator identity

The editor keeps the current Perchance account in `app.store.data.user`. `loggedIn`, `email`, and `sessionToken` describe the page session. Owner requests use `email` and `sessionToken` from the correct page session. Keep these values inside the authenticated context. Keep them out of logs, exports, and URLs under PCMS control.

| Operation | Request | Reply or meaning |
|---|---|---|
| Read account inventory | `POST /api/getGeneratorsByUser` with `{email, sessionToken}` | `status: "success"`, `generators`, and `generatorFolderMap`. Entries include `name`, `views`, and `isPrivate`. |
| Check ownership | `POST /api/checkGeneratorOwnership` with `{email, sessionToken, generatorName}` | `is-owner`, `is-not-owner`, or `session-token-error`. |
| Read saved generator | `POST /api/getGeneratorPageData` with `{generatorName}` | `status: "success"`, `generator`, and `dependencies`. This is a public read. |
| Read generator version | `GET /api/generatorPageDataVersion/<slug>` | The JSON reply can include `id`, `lastEditTime`, `saveCount`, `editorPayloadRevision`, `isPrivate`, and `schema`. Validate the reply shape. |

Use `app.data.generator.id` and the saved generator's `id` for identity. Keep the slug as the current address. Keep `publicId` in a separate field. `renameRevision` and `editorPayloadRevision` describe versions of different state. Keep them separate from `saveCount`.

`userOwnsThisGenerator` is a native page signal. `userCanSaveThisGenerator()` can also allow a generator edit key or a collaboration key. For a PCMS owner operation, confirm `is-owner` in the assigned account. Public reads need no owner session. Use a healthy route for public feed reads under the product specification.

If a known slug disappears, reconcile the inventory and generator ID. A matching ID under another slug can identify a rename. An empty or unavailable read does not establish deletion. Preserve the mapping while the identity is uncertain.

## 4. Generator lifecycle

### Create

Open `/minimal#edit:new` in the selected account. Use the native fork Save with the initial PJS and HTML. Expect `status: "created"` and a generated slug. Confirm the generated slug, generator ID, and owner before the next operation. Save can update the current document URL to the generated slug.

Read the new generator's listing setting from the server. A fork can start Listed. Setting `app.data.generator.isPrivate` locally before the fork does not establish its remote listing setting. Use an explicit Unlisted action for PCMS creation. Confirm it before staging unpublished source. Then assign the requested slug and confirm the same ID and owner at that slug.

### Rename

Use `app.openSettingsModal()`, the field `settingsModal.refs.newGeneratorName`, and `settingsModal.changeGeneratorName()`. The native form can check the target slug before sending the rename. An occupied slug can produce the visible `[data-ref="nameChangeError_alreadyExists"]` notice without a rename POST. The form can also receive `already-exists` from the server.

The owner request is `POST /api/changeGeneratorName` with `{email, sessionToken, currentName, newName}`. A `success` reply or a URL change still requires identity confirmation. The native editor can update the URL, reload the preview, or navigate during the rename. Rebind the editor to the confirmed slug and the same ID. Do not use the old slug for a later write.

### Listing

Use `app.openListingMenu()` and select `#listingMenuEl button[data-value="listed"]` or `#listingMenuEl button[data-value="unlisted"]`. Read the current server value before using the menu. The local label can lag behind the remote state. On an older interface, the settings modal can expose `changeGeneratorPrivacy()`.

The owner request is `POST /api/changeGeneratorPrivacy` with `{email, sessionToken, generatorName, isPrivate}`. Confirm the intended `isPrivate` value through a saved-generator read. Listing changes are separate from source Saves. An Unlisted generator remains accessible by its link. Treat its source and stored `src/` files as accessible by URL.

### Duplicate and delete

| Operation | Owner request | Contract |
|---|---|---|
| Duplicate | `POST /api/duplicateGenerator` with `generatorName` and optional `modelTextOverride`, `outputTemplateOverride`, `srcManifestOverride` | The reply supplies `newGeneratorName` and `publicId`. The native UI can duplicate current editor content, including pending source files. Select the intended source explicitly. |
| Delete | `POST /api/deleteGenerator` with `generatorName` | Permanently removes the generator. Confirm the exact ID and owner before an authorized delete. Reconcile the reply with the owner's inventory. The native UI can prompt and navigate away. |

Both requests use the current account's `email` and `sessionToken` in the body. A duplicate has a new identity. A missing generator does not authorize recreation.

## 5. Editor, files, and drafts

### PJS and HTML

| Operation | Native surface |
|---|---|
| Read PJS / HTML | `modelTextEditor.getValue()` / `outputTemplateEditor.getValue()` |
| Stage PJS / HTML | `modelTextEditor.setValue(text)` / `outputTemplateEditor.setValue(text)` |
| Check panel cleanliness | `isClean()` on each editor, where available. |
| Read or change selection | CodeMirror 6 `state.selection` and `dispatch()`. |
| Undo or redo a panel edit | The panel's native editor undo manager, exposed through `editorUndoManagers`. |
| Read editor save state | `window.perchanceSaveState` with `saved`, `unsaved`, `saving`, or `error`. |

Panel writes change the draft. Use the native setters so the editor can update its state. Refresh the native save state with `recomputeSaveState()` where the page provides it. Do not call `markClean()` to clear an operator's edits. It changes the editor's local baseline.

The output iframe's `generatorIsUnsaved` can reflect preview state. Use the editor's state, panel cleanliness, and `srcState` to decide whether the editor has unsaved source. Keep browser file-buffer text separate from the settled workspace value.

### `src/` files

Call `srcState.ready()` before reading or editing files. Use paths relative to `src/`, such as `assets/icon.png`. Each path segment starts with a letter or digit and can contain letters, digits, `.`, `_`, and `-`. Reject traversal and invalid path segments. Use bytes for binary files.

| Operation | Native surface | Effect |
|---|---|---|
| List | `srcState.list()` | Returns a path map. Entries can include `size`, `key`, `pending`, `rev`, and `unsaved`. |
| Read | `srcState.readFile(path)` | Reads the workspace file. Saved files can load from stored file bytes. |
| Write | `srcState.writeFile(path, bytes)` | Stages the exact bytes in the local workspace. |
| Rename or remove | `srcState.renameFile(from, to)` / `srcState.deleteFile(path)` | Stages a path change. A rename to an occupied file path can be rejected. |
| Read dirty state | `srcState.isDirty()` / `srcState.hasPending()` | Distinguishes workspace changes and pending uploads from saved files. |
| Wait for workspace work | `srcState.idle()` where available | Waits for queued workspace operations. Confirm the intended value with `readFile()` if a text viewer still has a pending edit. |
| Prepare for Save | `srcState.prepareForSave()` | Uploads pending bytes and prepares the manifest for the native Save. |

The native Files panel opens from `#aiAgentSrcFilesBtn`. It supports file and folder upload, drag and drop, search, rename, and delete. Its text viewer can delay writing typed content into the workspace. Use the viewer's own Save shortcut or wait for the intended bytes to reach the workspace before a separate Save. An immediate menu Save can leave the pending text outside the request.

`src/` is part of the saved generator. The Helper's `scratch` workspace is local to its session and stays outside the saved manifest. Preserve unrelated `src/` files when adding instructions or applying a partial change. Remove a path only when the intended source change calls for its removal.

A zero-byte `src/` upload can store non-empty bytes. Compare the returned file bytes with the intended zero-byte value. If they differ, keep the source unconfirmed. Preserve the intended file in the source copy.

### Draft persistence and exit guard

The editor can store dirty panels and file changes in local browser storage, including IndexedDB and origin-private file storage. This draft persistence does not change the server's saved source. A reload can open a draft picker. A choice can restore a particular local draft or open the saved source in a fresh workspace. Retain existing drafts when opening saved source.

`srcState.getDraftId()`, `getDraftKey()`, and `getWorkspaceId()` identify the current workspace. `getDraftPanels()` can expose its locally stored panel values. `listDrafts()`, `newDraft()`, `switchDraft(id)`, and `setDraftPinned(id, pinned)` are native draft methods. The draft picker also provides rename and delete controls. Treat the chosen draft as part of the editor identity. Draft retention depends on native storage and pinning.

Use `app.hasUnsavedWorkForExitWarning()` where available, with panel and `srcState` checks, before reload, navigation, or close. The page can request a browser `beforeunload` warning. The browser controls whether it displays a dialog, including any user activation requirement. Preserve dirty work and leave the decision to the operator when navigation would discard it.

## 6. Save and complete source readback

Use `app.saveGenerator()` or the native Save control. Before invoking it, confirm the owner, generator ID, current slug, draft, and source base. Settle any file-buffer edits. A PCMS operation must hold the generator's source lock before staging source. The lock covers PCMS writers. Other browsers and devices can still save to Perchance.

The native Save prepares pending `src/` files, then sends `POST /api/save`. The `generator` object carries `name`, `modelText`, `outputTemplate`, and the native generator settings and imports. `srcManifest` is a **top-level request field**. The native request also carries version checks such as `lastKnownSaveTime` and `lastKnownSaveCount`, plus credentials or any required challenge fields. Keep the native staleness checks enabled.

The Save reply can contain `name`, `time`, `saveCount`, `sourceRevision`, and `editorPayloadRevision`. Treat these as provider values and retain each field separately. After a source commit, the editor can send `POST /api/saveGeneratorDerivedData` with `generatorName`, `sourceRevision`, `generatorMetaData`, and import information. Source commit and metadata refresh are separate effects.

| Native reply or condition | Meaning and handling |
|---|---|
| `saved` | The provider acknowledges an update. Match the receipt to the intended generator and retain the returned time or revision fields. |
| `created` | The provider acknowledges a new generator. Confirm its ID and owner. Treat this reply during an intended update as an unexpected fork and hold further writes. |
| No Save request from a clean editor | No new Save receipt exists. An independent complete source match can establish that the intended content already exists. A Refresher operation still needs its marker Save receipt. |
| `stale` | The editor's base is outdated. Read the current saved state and reconcile before staging another write. Do not approve a stale-source override automatically. |
| `session-token-error`, `invalid-edit-key` | Recheck session, permission, and owner. Use the native sign-in flow when needed. |
| `captcha-needed` or a challenge document | Hold the affected operation for native verification. |
| `too-many-requests`, `too-big` | Apply the feature's limits and handle the provider's rate or size response. |
| `generator-does-not-exist` | Reconcile the slug, generator ID, and owner inventory. |
| `src-*`, `server-error`, or an unrecognized reply | Preserve the native response and local draft. Inspect the operation phase and stored state before deciding whether to issue another write. |
| Timeout, lost reply, tab close, or navigation after dispatch | The write result is Unknown. Reconcile stored state before issuing another write. |

A button click, a resolved frontend call, an HTTP `200`, or a clean editor is insufficient to confirm a particular write. Use the operation's native reply and the required independent readback. Do not infer that a transport timeout cancelled the server action.

### Read stored source independently

1. Call `POST /api/getGeneratorPageData` with `{generatorName}` from an independent read path. Confirm the `generator.id` and current slug.
2. Read `generator.modelText`, `generator.outputTemplate`, and `generator.srcManifest`. An empty manifest represents no saved `src/` paths. Check that the response supplies the source fields before comparing them.
3. Read each manifest key from `https://user.uploads.dev/file/<key>`. Manifest entries normally supply `{key, size}`. Support a string key if the source format contains one. Check the returned byte length and content.
4. Compare both panel strings, the exact path set, and all file bytes. Use SHA-256 and byte length if you compare file fingerprints. The manifest key alone does not establish equality with the intended content.

Use this readback for source deployment and final operator-accepted source. Preserve a previous saved copy before changing existing source. A Refresher marker Save uses the separate rule in [Recent and metadata](#8-recent-and-metadata).

### Reconcile an interrupted write

Keep the intended action, generator ID, expected slug, previous revision, and intended source before dispatch. After interruption, read the current saved source and version. Allow an in-flight provider effect to settle before deciding what the read means.

| Remote state | Interpretation |
|---|---|
| Intended complete source on the same ID | The intended source is present. Use the revision or operation receipt where the workflow also needs proof of a new write. |
| Previous complete source on the same ID | The previous source is present at the time of the read. A single early read cannot rule out a later commit. |
| Mixed, different, or unreadable source | Keep the result Unknown and hold writes for this generator. Preserve the available source and the local draft. |
| Wrong ID or ambiguous slug | Reconcile identity and ownership before any mutation. |

Apply the same principle to create, rename, listing, and delete. Confirm each effect using the relevant ID, slug, owner, or listing field. Continue independent work on other generators when the product permits it.

## 7. Native AI Helper

The Helper runs inside the editor. It uses the active generator and draft. A chat can edit local panels or `src/` files. Use an independent source read to determine what is saved on the server.

| Action | Native control |
|---|---|
| Show Helper from the console | `#showAiHelperBtn .toggleBtn` |
| New chat | `#aiAgentNewChatBtn` |
| Enter the user prompt | `#aiAgentInputEl` |
| Send or stop | `#aiAgentSendBtn` / `#aiAgentStopBtn` |
| Queue a follow-up | `#aiAgentQueueBtn`. The native queue holds up to three messages. |
| Inspect or change the queue | `#aiAgentQueueRowEl` and its native edit and remove controls. |
| Undo or redo a Helper edit | `#aiAgentUndoBtn` / `#aiAgentRedoBtn` |
| Files / attachments | `#aiAgentSrcFilesBtn` / `#aiAgentUploadBtn` |
| Draft options | `#aiAgentSettingsBtn` |

For PCMS DEVELOP, stage `specification.md`, `ui.md`, and `agents.md` under `src/`. Save the instruction files and confirm their bytes. Start one new native chat in the intended editor. Check the enabled control and the draft's chat association. New chat ends the prior session and clears the current local chat binding. When there is no existing chat, the editor can already be ready for a first message.

Keep existing input text intact. Set the native textarea to the exact `prompt.md` text and emit its `input` event. Check the textarea value before clicking Send once. The native client trims outer whitespace and can prepend editor, workspace, or rename context to the transmitted message. Treat the submitted user text and the native request envelope as separate values.

The native client starts or resumes a session, reserves a turn, and commits the message. A matching `/api/aiAgent/commit` acknowledgment confirms admission of the turn. The Helper can then run asynchronously. A busy, idle, stopped, or reconnecting UI state does not establish that the operator's intended source is complete.

Keep the editor and draft bound to the development job. An active Helper can make the editors read-only while it applies changes. Local chat and attachment data can survive a reload, and the native client can resume the server session. A reloaded editor does not by itself establish that the same chat or every local change survived. If admission or session continuity is unclear, keep the saved source and leave continuation or restart to the operator. Do not resend the prompt automatically.

The operator controls intermediate edits and Saves. PCMS completes the source workflow after the operator accepts the final source. It then checks both panels and all `src/` files against the accepted snapshot. Chat text and terminal events do not authorize publication. Keep prompts, source text, and chat transcripts out of the PCMS Journal.

### Session transport and attachments

The native client uses `ai-agent.perchance.org/api/aiAgent/`. It manages the session ID, routing key, tab ID, and event cursor. Keep all session credentials and IDs out of logs. Keep the native client responsible for reserving turns, reconnecting, executing editor tools, and applying results.

| Interface | Role |
|---|---|
| `POST start`, `POST resume` | Open or resume the native session. |
| `POST reserve`, `POST commit`, `POST release` | Reserve, submit, or release a turn. |
| `GET events` | Server-Sent Events for connection state, heartbeat, deltas, editor tool calls, and terminal frames. |
| `POST toolResult`, `POST ping`, `POST interrupt` | Return tool output, keep the session active, or request a stop. |
| `POST end` | Ends the session. The native client can send it as a beacon. |
| `POST history` | Returns settled conversation entries for the session. A transcript does not contain the full event stream or attachment bytes. |

User attachments enter the draft's pending message workspace, under `scratch/message-attachments/`. They are separate from the public `src/` manifest. The editor can download a Helper-generated attachment from its local file store through the attachment chip. A download chip does not imply a publicly hosted file.

## 8. Recent and metadata

`GET /api/getGeneratorList?max=1000` reads the public Recent feed. The reply contains `status: "success"` and `generators`. Each entry has a `name` and can carry `views`, `lastEditTime`, `lastEditTime_ago`, and `metaData`. `lastEditTime` uses Unix epoch milliseconds. `lastEditTime_ago` is display text.

| Query field | Meaning |
|---|---|
| `max` | Requested number of entries. The PCMS request uses `1000`. The reply can contain fewer entries. |
| `contentFilter=none` | Allows results that the default content filter excludes. Keep results from different filter settings separate. |
| `tags=tag1,tag2` | Applies the API's tag filter to `$meta.tags`. Encode the query value. |

Read rank as the one-based position in the returned array. Use the API order as returned. Pinned entries, quick links, and other directory UI elements do not define API rank. Reject an invalid response, including duplicate or invalid names, before using it to make a rank decision. Retain the time of the last valid sample.

Saving source updates a generator's edit time. A Listed generator can appear in Recent after a Save. Listing state, stored edit time, and observed rank are separate values. Unlisted generators are excluded from the public feed. A Listed generator can be outside the returned set. Absence from one or more replies does not establish listing state or deletion. Perchance does not provide an exact time to appear or a rank guarantee.

The feed can serve cached data with a 60-second lifetime. `getGeneratorStats` can serve cached metadata with a 600-second lifetime. Use the response headers, including `Cache-Control` and `Age` where available, to interpret freshness. A cache miss or a unique query string does not establish that the directory has indexed the latest source.

For PCMS Refresher, replace one PCMS-owned inert comment in PJS and one in HTML. Use syntax-safe comments and update the existing markers in place. Keep the generator Listed and use its owner's native editor. Skip a dirty editor. An acknowledged marker Save while Listed records `refreshed`. Measure rank independently through scheduled feed reads. An individual rank read is not part of Save confirmation.

### Public metadata and download interfaces

All paths in this table are on `https://perchance.org`.

| Request | Result |
|---|---|
| `GET /api/getGeneratorStats?name=<slug>` | `status: "success"` with `data` containing name, views, edit time, metadata, and `publicId`. Use `names=<a,b>` for multiple slugs. |
| `GET /api/getGeneratorScreenshot?generatorName=<slug>` | Generator screenshot image. |
| `GET /api/downloadGenerator?generatorName=<slug>` | Packaged HTML with the runtime. `listsOnly=true` returns only PJS. |
| `GET /api/getGeneratorHtml?generatorName=<slug>` | Raw HTML-panel source. |
| `GET /api/downloadGeneratorOutputTemplate?generatorName=<slug>` | Raw output template as text. |
| `GET /api/getGeneratorsAndDependencies?generatorNames=<a,b>` | `{success, generators}`. The generator map includes PJS `code`, `imports`, and transitive dependencies. |
| `POST /api/getGeneratorPageDependencies` with `{generatorName}` | The dependency list used by the page. |
| `GET /api/getDynamicMetaData?__generatorName=<slug>` | Evaluates saved dynamic metadata with the supplied query parameters. |

Use the complete source read for backups and source comparison. A PJS, HTML, or dependency download on its own does not supply the full `src/` file set.

`$meta` in PJS defines static `title`, `shortTitle`, `description`, `image`, `icon`, `tags`, and `header`. The title falls back to the first heading of type `h1` or the slug. `shortTitle` sets the installed app label and defaults to the title. `tags` takes comma-separated values in source. `header.mode` can select `minimal`. `header.background` accepts a CSS background. Use a square PNG or JPEG on `user.uploads.dev` for `$meta.icon`.

`$meta.dynamic(inputs)` can return query-dependent `title`, `description`, and `image`. Read query parameters from `inputs.urlParams`. The server evaluates the saved function in an isolated scope. Include all helpers inside the function and keep static fallbacks. Keep `tags` and `header` static. Both function results and HTTP metadata can be cached.

## 9. Uploads and revisions

### Uploads

Use the native `srcState` Save path for generator files. For standalone assets, the Perchance upload page or upload plugin provides the upload flow. The embed runs on `upload.perchance.org`. Its message exchange uses `init`, `uploadEmbedIsReady`, `anonUploadRequest`, and `anonUploadResponse`. The request ID ties the reply to the upload. The native client handles verification and chunked transfer.

| Upload host interface | Role |
|---|---|
| `GET /api/checkVerificationStatus` | Checks a stored uploader verification key. |
| `GET /api/cloudflareTurnstileVerify` | Exchanges native Turnstile verification for a key. |
| `POST /api/upload` | Accepts the native data URL payload or a chunked upload reference. The reply can include URL, size, file ID, and deletion key. |
| `POST /api/uploadChunk` | Receives chunks for larger uploads. |
| `GET /api/delete` | Removes a standalone upload with its file ID and deletion key while the key is valid. |

The upload service can reuse a key for identical bytes. Use the returned key and check the file contents. Upload completion stores bytes. The generator refers to those bytes only after Save commits the manifest. Removing a path from `src/` changes the manifest. It does not authorize deleting an asset from shared storage.

### Revisions and account organization

The **backups** control opens the revision viewer through `app.openRevisionsModal()`. Perchance provides revision downloads. To apply an earlier version, use its downloaded source as the input to an ordinary source Save with the current ownership, draft, and revision checks.

| Owner request | Result |
|---|---|
| `POST /api/getGeneratorDiffPatches` with `generatorName` | Ordered PJS and HTML patches with revision times. The editor reconstructs each revision by applying patches to the base. |
| `POST /api/getGeneratorSrcRevisions` with `generatorName` | Source manifest revisions. Match the manifest to the selected source revision when exporting. |
| `POST /api/getPrivateNotes` / `POST /api/setPrivateNotes` | Read or set `privateNotes` for the generator. |
| `POST /api/saveUserGeneratorFolderMap` | Saves the account's `generatorFolderMap` as a JSON string. Folder placement is account organization. |

These requests use the owner session in their bodies. The native revision download combines reconstructed PJS and HTML with the associated files. The account modal can sort generators by its default order, name, or views.

## 10. Preview, console, and related editor features

| Feature | Native surface and behavior |
|---|---|
| Preview frame | `#outputIframeEl`. The editor sends source and workspace updates to the frame through its native bridge. |
| Preview reload | Use the preview reload control or `editor.handleReloadButtonClick()` where available. This reloads output. A full document reload also reloads the editor and draft. |
| Auto reload and fullscreen | Use native preview controls. Auto reload is a local preference. Fullscreen can switch the current page to view mode. |
| Console | `#console-input` evaluates in the output context through `editor.evaluateText()`. The native console can display HTML or plain text. History is local to the generator. |
| Warnings | The preview sends `codeWarningsUpdate`. The editor opens its warnings panel through `[data-ref="warningsModalOpenButton"]`. Entries can include line number, warning ID, and generator name. |
| Runtime errors | The preview can show `#perchance-error-indicator` and an error panel inside the frame. The editor can also copy the message into the Helper input. Preserve that input. |
| Lint diagnostics | Editor diagnostics can arrive asynchronously. An empty immediate result does not establish clean source. |
| Search, wrap, fold, popout | Use the native CodeMirror search panel, editor settings, and popout control. These affect local UI state. |

Desktop Helper Enter sends or queues. Shift+Enter inserts a newline. In the source file viewer, Ctrl/Cmd+S commits its edit and invokes Save. In edit mode, Ctrl/Cmd+R can reload only the preview. Use the intended native control when the distinction matters.

Collaborative editing uses Yjs and a shared room. A collaboration key and a verified owner account grant different access. The editor can wait for initial room sync or block draft switching while a collaboration session is active. Treat a busy or unsynced editor as unavailable for PCMS source writes. Inline Copilot uses a separate completion service at `editor-copilot.perchance.org`. The native Helper does not require Copilot.

## 11. Background operation and provider limits

Open routine editor operations in an inactive owner-bound tab through PCMS's PersonaMonkey integration. A background operation must preserve the user's selected tab and window. Use explicit tab and document identity. A tab that belongs to the operator or is reserved for development is unavailable for unrelated work.

An inactive editor can run native operations. The browser can delay timers, suspend work, or discard the document. Use bounded waits and check document identity on reply. If the document changes after a write may have reached Perchance, reconcile the remote effect. A new document must establish editor and draft readiness before another action.

Treat sign-in pages, Cloudflare pages, modal dialogs, and upload verification as distinct conditions. Require a valid native page and the expected response type before using a result. The operator can open the affected tab explicitly when an action needs interaction. Keep independent operations on other targets available.

Use read-only reconciliation when the remote state is uncertain. Use the product's retry limits for definite rejections that permit retry. Provider quotas, cache behavior, frontend selectors, and unsupported reply fields can change. Honor the current response and keep any unresolved operation on hold.
