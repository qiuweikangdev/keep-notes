# Git Status Refresh Without List Flicker

## Goal

Keep the Git changes list visible when a discard operation refreshes repository status, while clearly communicating that the refreshed data is loading.

## Scope

Only the Git operation panel's changes tab is affected. Initial panel loading continues to use the existing full-content loading state.

## Design

The panel already tracks Git information loading through `isGitInfoLoading`. The changes tab currently replaces the entire list with a loader whenever this flag is true, which unmounts the visible file rows during a post-discard refresh.

The renderer will distinguish initial loading from a refresh by checking whether a Git status value has already been loaded:

- On initial loading, retain the existing full-content loader.
- On refresh after status exists, keep the current list mounted and render a positioned, translucent loading overlay above the list.
- Disable pointer interaction through the overlay while the refresh is pending, preventing actions against stale rows.
- Replace the status data only when the refresh request returns, so the list changes once rather than disappearing and reappearing.

## Error Handling

If refreshing Git information fails, the existing failure handling remains in place. The prior list remains visible until a successful result replaces it.

## Testing

Add a component test that starts a discard operation, holds the following status refresh pending, and asserts that the prior file row remains visible together with the refresh loading indicator. After resolving the refresh, assert that the refreshed list is rendered.

## Non-goals

- Optimistic deletion of files before Git confirms the discard.
- Changes to Git discard semantics or IPC APIs.
- Changes to initial panel loading, commit history loading, or footer operation behavior.
