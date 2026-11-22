# Native Helper interface evidence

Read-only public-source inspection, 2026-11-22. `https://perchance.org/minimal` loads `/lib/appExtras.js`, which loads `/lib/aiAgentClient.js`. The inspected client SHA-256 is `783bfc607c1b8cf9c802be95cd10657a100d6c404edb7efb8043e5a6ce4c90e9` (asset version `mwkijeux-a3824c4c327f7bcdc416a8b7065c8e8af6d434474f337974dc2d74455aed42f9`). This is mechanics evidence, not live account qualification. No Helper prompt or owner mutation was dispatched during inspection.

- The Files button passes a separate `scratchFs` adapter to `PerchanceSrc.buildFilesPanel`. It supports `ready`, `list`, `readFile`, and `writeFile`; paths are relative to scratch. Capture this argument only during the native Files action and restore the original function immediately. Never write instructions through native `srcState`.
- `aiAgentActivityState()` includes active/unknown preparation, recovery, tools, and queued messages. Its quiet state alone is not completion.
- Native Send reads `#aiAgentInputEl` and uses `#aiAgentSendBtn`. The client may prepend workspace notes, so validate the exact input and the transmitted instruction suffix separately.
- The native admission endpoint is `https://ai-agent.perchance.org/api/aiAgent/commit`; body fields include attempt ID and session ID. An `ok` receipt proves admission only. The native client itself can retry a commit after ambiguity; the PCMS observer blocks a second transport for its same attempt and keeps the outcome Unknown.
- Native `events` EventSource frames use `done` with the attempt ID; errors and reconnection are distinct. Native `interrupt` is observed as Stop, never successful completion.
- `srcState.getDraftChatSid()` binds a chat to a draft. Existing chats and composer input are preserved: automatic startup requires a fresh unbound chat. Native New Chat is an operator action for an existing retained conversation.

All native Helper writes remain statically disabled pending a disposable operator-controlled Firefox/Violentmonkey test. The accepted v1.4 specification overrides older discovery prose suggesting instruction-file Saves into native src.
