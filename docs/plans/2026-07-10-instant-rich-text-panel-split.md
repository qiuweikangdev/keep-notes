# Instant Rich-Text Panel Split Design and Implementation Plan

**Goal:** Make every enabled panel split reveal a fully initialized, immediately editable rich-text editor without creating a BlockNote instance or replacing the whole document in the click path.

## Design

### Hot standby

Keep at most one hidden split-warmup panel in runtime state. The panel owns a real BlockNote editor, a cloned active tab, and a persistent detached DOM surface. It is excluded from the visible panel layout and is never persisted.

The warmup manager prepares the standby after the active rich-text editor becomes ready and the browser reaches an idle period. A standby moves through `preparing`, `ready`, and `claimed` states. Split actions are enabled only for a matching `ready` standby.

### Claim path

`addPanelGroup` claims a matching ready standby by changing only its runtime metadata: direction, split parent, and warmup state. The group and tab IDs, React subtree, BlockNote instance, ProseMirror view, and surface DOM all remain stable. The surface registry then attaches the existing surface to the newly created visible host.

No editor construction, Markdown parsing, full-document serialization, or `replaceBlocks` call is allowed in the split click path.

### Document consistency

Register mounted rich-text editors in a runtime mirror registry. A warmup editor starts from the source editor's live block snapshot rather than the potentially stale Markdown store value. Document-changing ProseMirror steps are queued without updating the hidden editor in the input path, then combined into one transaction and replayed during browser idle time with a mirror metadata flag and `addToHistory: false`. The split action remains disabled while this queue is pending. After claim, both visible editors remain in the same synchronization group and continue exchanging batched steps in either direction. Markdown snapshot updates must not increment `reloadKey` for a synchronized peer, because that would replace the complete large document after each serialized change. Mirrored transactions must not create save loops or independent user-intent revisions.

If a transaction cannot be replayed because the documents diverged, mark the standby stale and disable split until a new standby has been prepared. Never claim a stale instance.

### Interaction and resource limits

- Keep only one hidden standby globally.
- Once a large document has two visible rich-text copies, do not allocate a third hidden editor. Disable another same-document split and explain the two-panel performance limit.
- Source-mode and unloaded tabs do not create a BlockNote standby.
- Split controls expose a disabled state and a preparation tooltip until the matching standby is ready.
- Claiming a standby schedules replenishment after the visible layout has painted.
- Closing the last visible panel must ignore hidden standby groups.

## Implementation Plan

### Task 1: Runtime split-warmup state

**Files:**
- Modify: `src/renderer/src/store/editor.store.ts`
- Modify: `src/renderer/src/store/editor.store.test.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-view-selectors.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-view-selectors.test.ts`

Add warmup metadata and store actions to prepare, mark ready/stale, discard, query, and claim a standby. Test that claiming preserves group/tab identity and that visible-panel removal ignores warmup groups.

### Task 2: Rich-text editor mirror registry

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-instance-registry.ts`
- Create: `src/renderer/src/features/editor/lib/editor-instance-registry.test.ts`

Register editor instances, expose live source snapshots, mirror document transactions without recursion, and report divergence. Unit-test successful mirroring, loop prevention, and stale callbacks.

### Task 3: Warmup lifecycle and persistent surface

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor.tsx`
- Modify: `src/renderer/src/features/editor/components/editor.test.tsx`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`

Render warmup groups into detached persistent surfaces, prepare one standby during idle time, seed it from the live source editor, register it for transaction mirroring, and mark it ready only after its document matches the source.

### Task 4: Split interaction readiness

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor-tab-bar.tsx`
- Create or modify: `src/renderer/src/features/editor/components/editor-tab-bar.test.tsx`

Remove ineffective transition wrapping from split handlers. Disable split controls until a matching standby is ready and provide a concise preparation tooltip/status. Test that enabled actions claim the standby without mounting another editor.

### Task 5: Verification

Run focused editor tests, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Inspect the final diff to ensure unrelated staged and unstaged work remains untouched.
