# Reminder Editor Layered Dialog Design

## Goal

Improve the create and edit reminder dialog so it feels visually connected to the reminder search list while remaining the clear interaction focus. The result must preserve Keep Notes' restrained product style, maintain the visible reminder list behind the editor, and improve hierarchy without changing reminder behavior.

## Scope

The change covers these files:

- `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`
- `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`
- `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`
- `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`

Reminder persistence, IPC, scheduling, filtering, repeat semantics, notification behavior, and the custom repeat workflow remain unchanged.

## Layering Model

- Keep the reminder search list visible when the editor opens.
- Treat the list as background context: reduce its visual emphasis and prevent accidental interaction while the editor is active.
- Keep both surfaces horizontally centered so they read as one interaction flow.
- Use an editor width of approximately 460 px inside the 520 px reminder list footprint, creating a deliberate inset instead of two unrelated modal widths.
- Keep the editor in front of the list with a restrained border and compact shadow. Avoid decorative blur or heavy elevation.
- Position the editor consistently relative to the reminder list rather than relying on an unrelated viewport-centered placement.

## Dialog Structure

The dialog contains four regions:

1. A compact header with a contextual title and close action.
2. A primary title input region.
3. A continuous schedule settings region for date, time, and repeat.
4. A restrained footer containing cancel and save actions.

The header title uses approximately 15 px semibold text. The close action uses the same compact icon-button vocabulary as the reminder search list and retains an accessible label.

## Form Hierarchy

- Keep the title input as the first and strongest control.
- Use a 36 px input height and existing theme tokens.
- Preserve visible focus feedback without making the default border look permanently selected.
- Continue showing an associated file name below the title when one exists.
- Remove the bordered card appearance around the date, time, and repeat rows.
- Present those settings as one continuous region with stable 48 px rows and inset dividers.
- Keep the existing Lucide icons, concise labels, and trailing picker controls.
- Preserve the custom repeat summary and edit action when a custom rule is selected.

## Footer and Actions

- Separate the footer from the form using a single divider and a subtle theme-derived surface tint.
- Keep cancel as the secondary action.
- Label the primary action `保存提醒` so the result is explicit.
- Preserve the current disabled state until title, date, and time are valid.
- Do not add explanatory copy that repeats visible labels.

## Motion

- Add only a short editor entrance transition, approximately 160 ms, using opacity and a small vertical offset.
- Use an ease-out curve and avoid bounce, scale choreography, or decorative motion.
- Provide a `prefers-reduced-motion` alternative that removes the positional transition.
- The background list de-emphasis should be immediate or use the same short state transition.

## Responsive Behavior

- Keep the editor within the viewport with a 16 px minimum outer margin.
- Preserve the compact desktop layout at normal widths.
- Allow the trailing picker column to contract on narrow windows without clipping labels or actions.
- Keep picker portals and custom repeat content above the editor and outside clipped containers.

## Accessibility

- Preserve Radix dialog title and description semantics.
- Keep the visible title aligned with the dialog's accessible name.
- Maintain keyboard access for close, title, date, time, repeat, cancel, and save controls.
- Prevent background reminder list interaction while the editor is active.
- Retain visible focus states across all supported themes.
- Keep disabled and muted states readable using existing theme tokens.

## Testing

Focused component tests will verify:

- the editor uses the new layered width and positioning vocabulary;
- the reminder list remains rendered but is visually de-emphasized and non-interactive while the editor is open;
- the settings region no longer uses the nested bordered-card treatment;
- the explicit `保存提醒` action and its disabled state;
- create, edit, cancel, date picker, time picker, repeat picker, and custom repeat behavior remain unchanged;
- accessible dialog naming and keyboard-reachable controls remain intact.

After focused tests, run:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Perform a final visual inspection in the Electron development app if the environment can launch it.

## Out of Scope

- Changing the reminder search list information architecture.
- Adding new reminder fields or optional scheduling modes.
- Changing reminder persistence, IPC, notification, or repeat calculations.
- Redesigning the custom repeat dialog or notification toast.
- Introducing new dependencies or a shared modal framework.
