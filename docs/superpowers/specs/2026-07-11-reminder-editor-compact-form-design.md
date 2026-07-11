# Reminder Editor Compact Form Design

## Goal

Restyle the create and edit reminder dialog as a compact, native-feeling form that matches Keep Notes' current command-palette and settings surfaces. The redesign must reduce visual nesting and redundant information while preserving reminder scheduling, repeat rules, file association, and nested picker behavior.

## Scope

The change covers `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx` and its focused tests. It applies to both create and edit modes because they share the same component. Reminder storage, IPC, scheduling, repeat semantics, picker data, and the custom repeat dialog remain unchanged.

## Dialog Shell

- Use a compact dialog approximately 440 px wide.
- Use `--bg-primary` for the main surface, the existing border token, a 12 px corner radius, and a restrained shadow.
- Add a visible header row with the contextual title "新建提醒事项" or "修改提醒事项" and a standard close button.
- Keep the accessible Radix title and description semantics.
- Retain Escape and outside-click dismissal through the existing Radix dialog behavior.

## Form Structure

The dialog contains four visual regions:

1. A compact header row.
2. A title field region.
3. One continuous settings group containing date, time, and repeat rows.
4. A compact footer with cancel and save actions.

The title input uses the project's standard 14 px form typography and 36 px height instead of the current large, bold title treatment. When a reminder is associated with a file, the file name appears immediately below the title input as 11 px muted secondary text. No placeholder is shown when no file is associated.

## Settings Rows

Date, time, and repeat become three compact rows in one bordered group:

- Each row uses a leading Lucide icon, a concise label, and a trailing picker control.
- Rows use consistent height, padding, and separators.
- The duplicate date/time detail values currently shown beneath their labels are removed because the picker control already displays the selected value.
- The date and time switches are removed. They currently make saving impossible when disabled and do not represent a supported reminder state.
- The repeat row continues to open the existing repeat picker.
- When the repeat preset is custom, the existing custom-repeat summary and edit entry remain available as secondary content beneath the repeat row.

## Footer and Actions

- Use a compact footer separated by a single top border.
- Keep "取消" as the secondary action and "保存" as the primary action.
- Preserve the existing disabled-save rule: a non-empty title, date, and time are required.
- Preserve create and edit submission behavior and keep the reminder list open when the editor was launched from it.

## Picker Behavior

Date, time, and repeat picker implementations remain functionally unchanged. Their trigger widths may be reduced to fit the compact form, while popup dimensions and interaction behavior remain stable. Custom repeat continues to use the existing nested dialog.

## Accessibility

- The visible header must match the Radix dialog's accessible name.
- The close button must have an accessible label.
- Title, date, time, repeat, cancel, and save controls must remain keyboard reachable.
- Existing focus states must remain visible across all supported themes.
- Muted file association text must use the existing theme token and remain readable.

## Testing and Verification

Focused component tests will verify:

- the compact dialog width and visible contextual header;
- the standard-sized title input;
- the absence of date and time switches;
- one continuous settings group with date, time, and repeat rows;
- associated file secondary text and the no-file state;
- unchanged create, save, cancel, picker reset, and custom-repeat behavior.

Verification will run the focused reminder editor tests, `pnpm typecheck`, `pnpm lint`, and `pnpm build`, followed by visual inspection in the Electron development app.

## Out of Scope

- Optional date-only or time-only reminders.
- Changes to reminder persistence, IPC, scheduling, or repeat calculations.
- Redesigning the reminder list, notification toast, or custom repeat dialog.
- Introducing new dependencies or a new shared form framework.
