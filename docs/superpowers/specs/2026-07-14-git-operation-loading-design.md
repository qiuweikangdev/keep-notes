# Git Operation Loading Design

## Scope

Update the four footer actions in the Git panel: pull, push, commit, and commit-and-push. The change does not alter staging, discarding, branch management, or history actions.

## Interaction Design

The panel tracks one active footer operation: `pull`, `push`, `commit`, or `commit-and-push`.

- Every footer action has a permanent semantic icon.
- When an action is active, only that action replaces its icon with a spinning loader.
- While an action is active, a semi-transparent overlay is shown over the panel content area with a centered spinner. The overlay blocks pointer input so users cannot start another Git action.
- The active state is cleared after success, a handled Git error, or an unexpected exception.

## State and Data Flow

`handlePull`, `handlePush`, and `handleCommit` set the active operation before their async Git call. Their `finally` blocks clear it. The existing generic loading state remains responsible for existing disablement and data refresh behavior.

The commit handler derives the active operation from its `pushAfterCommit` argument so commit and commit-and-push remain separate loading states.

## Accessibility

The loading overlay uses a status role and an accessible label. The label is not rendered as visible copy, matching the compact loading treatment requested for the panel.

## Verification

Component tests use deferred Git API responses to verify that each footer operation shows its matching button loader and the central overlay until the request settles. Existing Git panel tests must remain green.
