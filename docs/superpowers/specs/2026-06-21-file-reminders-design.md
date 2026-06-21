# File Reminders

## Overview

Add file-bound reminders to the Electron desktop app. Users can create a reminder from a Markdown file in the file tree, configure title/date/time/repeat settings in a Reminders-like dialog, receive a native desktop notification when the reminder is due, and manage all reminders from a title-bar entry point.

The visual reference is macOS Reminders. The implementation should match the functional structure and general feel, but it does not need pixel-perfect parity. The UI should remain consistent with the existing app tokens, Radix primitives, Lucide icons, and compact desktop layout.

## Goals

1. Add a file-tree right-click action named "新建提醒事项" for Markdown files.
2. Show a reminder editor dialog bound to the selected file.
3. Capture only the required fields: title, date, time, and repeat.
4. Support built-in repeat presets and a custom repeat dialog.
5. Fire a native desktop notification at the scheduled date and time.
6. Show the reminder title and file name in the notification.
7. Open the bound file in a new app window when the notification is clicked.
8. Add a title-bar reminders icon with tooltip.
9. Show a searchable reminders list dialog with Today, All, and Completed tabs.
10. Support list item context actions: delete, mark complete, and edit.
11. Require confirmation before deleting a reminder.

## Non-Goals

1. Do not add notes, priority, list selection, location, subtasks, attachments, or calendar integration.
2. Do not write reminder metadata into Markdown files.
3. Do not require pixel-perfect macOS Reminders styling.
4. Do not support complex recurrence rules such as "third Friday" or "until date" in this iteration.
5. Do not add sync across devices.

## Recommended Approach

Use a main-process reminders service for storage, scheduling, and native notifications, with renderer components handling dialogs, lists, search, and context menus.

This approach fits the Electron architecture because native notifications and notification click handling belong in the main process. It also keeps reminders independent from any single renderer component lifecycle.

## Alternatives Considered

### Renderer-only persistence and timers

Store reminders in a Zustand persisted store and schedule timers in React.

Pros:
- Smallest implementation surface.
- Simple renderer-only data flow.

Cons:
- Timers are tied to renderer windows.
- Notifications may be missed when windows close or reload.
- Notification click handling still needs main-process support.

### Markdown metadata

Persist reminders in Markdown frontmatter or hidden metadata blocks.

Pros:
- Reminder data travels with the file.
- Easy to inspect manually.

Cons:
- Mutates user notes for app metadata.
- Requires parsing and migration.
- Can create unwanted Git diffs.

## Architecture

### Shared Types

Add reminder types in `src/shared/types/index.ts`.

```ts
export type ReminderRepeatPreset =
  | "never"
  | "daily"
  | "weekdays"
  | "weekends"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly"
  | "custom";

export type ReminderRepeatUnit = "day" | "week" | "month" | "year";

export interface ReminderRepeatCustomRule {
  interval: number;
  unit: ReminderRepeatUnit;
}

export interface Reminder {
  id: string;
  title: string;
  filePath: string;
  fileName: string;
  scheduledAt: string;
  repeat: ReminderRepeatPreset;
  customRepeat?: ReminderRepeatCustomRule;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  lastNotifiedAt?: string;
}

export interface ReminderInput {
  title: string;
  filePath: string;
  scheduledAt: string;
  repeat: ReminderRepeatPreset;
  customRepeat?: ReminderRepeatCustomRule;
}
```

### IPC Channels

Add a `REMINDER` group in `src/shared/constants/ipc-channels.ts`.

Required channels:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `reminder:list` | invoke | Return all reminders |
| `reminder:create` | invoke | Create a reminder |
| `reminder:update` | invoke | Update a reminder |
| `reminder:delete` | invoke | Delete a reminder |
| `reminder:complete` | invoke | Mark a reminder complete |
| `reminder:on-changed` | event | Notify renderers after any reminder change |

### Main Process Service

Add a focused service under `src/main/reminders.ts`.

Responsibilities:

1. Load and save reminders from a JSON file under `app.getPath("userData")`.
2. Normalize reminder inputs and derive `fileName` from `filePath`.
3. Schedule pending due reminders with `setTimeout`.
4. Re-schedule timers after create, update, delete, and app startup.
5. Show `new Notification({ title, body })` when a reminder is due.
6. On notification click, call the existing `openPathInNewWindow(filePath)`.
7. For repeating reminders, calculate the next `scheduledAt` after notification and keep the reminder active.
8. For non-repeating reminders, leave the reminder incomplete until the user marks it complete, but avoid firing it repeatedly by storing `lastNotifiedAt`.

The service should cap timer delays to a safe maximum and re-check reminders after long delays so dates beyond the platform timeout range still work.

### Preload API

Add `src/preload/api/reminder.api.ts` and expose narrow renderer-safe methods:

```ts
listReminders(): Promise<Reminder[]>
createReminder(input: ReminderInput): Promise<Reminder>
updateReminder(id: string, input: Partial<ReminderInput>): Promise<Reminder>
deleteReminder(id: string): Promise<boolean>
completeReminder(id: string): Promise<Reminder>
onRemindersChanged(callback: (reminders: Reminder[]) => void): () => void
```

Update renderer Electron typings in `src/renderer/src/types/electron.d.ts`.

### Renderer Store

Add `src/renderer/src/store/reminder.store.ts`.

State:

| Field | Purpose |
|-------|---------|
| `reminders` | Current reminders from main process |
| `isEditorOpen` | Whether the reminder editor dialog is open |
| `editingReminderId` | Reminder being edited |
| `draftFilePath` | File path used when creating a reminder from the tree |
| `isListOpen` | Whether the reminders list dialog is open |

Actions:

1. Load reminders from IPC.
2. Subscribe to `onRemindersChanged`.
3. Open create dialog for a file.
4. Open edit dialog for an existing reminder.
5. Create, update, delete, and complete reminders through IPC.

The store should keep data authoritative in the main process and use the renderer copy only for UI.

## UI Design

### File Tree Context Menu

In `src/renderer/src/features/file-tree/components/file-tree.tsx`, add a menu item for Markdown file nodes:

```text
新建提醒事项
```

Use a Lucide icon such as `BellPlus` or `CalendarClock`. The action opens the reminder editor with the selected file path.

Folders should not show this action in the first iteration.

### Reminder Editor Dialog

Add `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`.

Layout:

1. Title input at the top.
2. Section label: `日期与时间`.
3. Date row with icon, formatted date preview, date input, and enable switch.
4. Time row with icon, formatted time preview, time input, and enable switch.
5. Repeat row with icon and repeat selector.
6. Footer buttons: cancel and save.

Because the feature requires date and time, the switches can control whether each input row is active visually, but save validation must require a valid final scheduled date and time. If turning either switch off would make the reminder unschedulable, save should be disabled.

Default values:

1. Title: empty.
2. File: selected file.
3. Date: today.
4. Time: next rounded time, preferably current time plus 30 minutes rounded to the next 5 minutes.
5. Repeat: `never`.

### Repeat Selector

Built-in options:

1. 永不
2. 每天
3. 工作日
4. 周末
5. 每周
6. 每两周
7. 每月
8. 每 3 个月
9. 每 6 个月
10. 每年
11. 自定义

Selecting `自定义` opens the custom repeat dialog.

### Custom Repeat Dialog

Add `src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx`.

The dialog follows the second reference image functionally:

1. Frequency selector.
2. Interval number input.
3. Unit label.
4. Cancel button.
5. Confirm button labeled `好`.

Supported custom units:

| Frequency label | Stored unit | Example text |
|-----------------|-------------|--------------|
| 每天 | `day` | 每 1 天 |
| 每周 | `week` | 每 1 周 |
| 每月 | `month` | 每 1 月 |
| 每年 | `year` | 每 1 年 |

Validation:

1. Interval must be an integer.
2. Interval must be at least 1.
3. Invalid input keeps the confirm button disabled.

### Title Bar Entry

In `src/renderer/src/components/layout/title-bar.tsx`, add a reminders icon in the right-side tool group near the Git, theme, and settings buttons.

Use tooltip text:

```text
提醒事项
```

Clicking opens the reminders list dialog.

### Reminders List Dialog

Add `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`.

Content:

1. Search input.
2. Tabs: `今天`, `全部`, `完成`.
3. Reminder rows with title, file name, scheduled date/time, and repeat label.
4. Empty states per tab.

Filtering:

1. `今天`: incomplete reminders whose scheduled date falls on the current local day.
2. `全部`: all incomplete reminders.
3. `完成`: completed reminders.
4. Search matches title and file name.

Context menu actions:

1. `修改`: opens the editor dialog for that reminder.
2. `标记为完成`: calls `completeReminder`.
3. `删除`: opens a confirmation dialog.

Completed reminders should hide the complete action or show it disabled.

## Repeat Scheduling Rules

When a repeating reminder fires, calculate the next occurrence after the current due time.

| Repeat | Next occurrence |
|--------|-----------------|
| `daily` | Add 1 day |
| `weekdays` | Add days until Monday-Friday |
| `weekends` | Add days until Saturday-Sunday |
| `weekly` | Add 1 week |
| `biweekly` | Add 2 weeks |
| `monthly` | Add 1 month |
| `quarterly` | Add 3 months |
| `semiannual` | Add 6 months |
| `yearly` | Add 1 year |
| `custom` | Add `interval` of `unit` |

Use local time because the UI is a local desktop reminder feature. If a date lands on a shorter month, let JavaScript Date normalization pick the closest valid date for this iteration, and keep that behavior covered by tests.

## Error Handling

1. If reminder storage cannot be read, start with an empty list and log the error.
2. If reminder storage cannot be written, return a failed IPC response or throw a handled error so the renderer can avoid optimistic UI.
3. If the bound file no longer exists when a notification is clicked, attempt `openPathInNewWindow(filePath)` and let existing error handling return false; do not crash.
4. If a reminder has invalid persisted data, skip scheduling it and keep the rest of the list usable.
5. If native notifications are unavailable, keep reminder data intact and log the notification failure.

## Testing Strategy

### Unit Tests

Add focused tests for main-process reminder logic:

1. Creating a reminder stores `fileName`, `createdAt`, and `updatedAt`.
2. Updating a reminder preserves the same `id`.
3. Completing a reminder sets `completed`.
4. Deleting a reminder removes it from persisted data.
5. Repeat calculation covers daily, weekdays, weekends, weekly, biweekly, monthly, quarterly, semiannual, yearly, and custom interval rules.
6. Due non-repeating reminders set `lastNotifiedAt` and do not repeatedly notify for the same scheduled time.
7. Due repeating reminders advance to the next scheduled time.

### Renderer Tests

Add focused tests where practical:

1. File-tree Markdown context menu contains `新建提醒事项`.
2. Reminder list filters Today, All, and Completed tabs.
3. Search matches title and file name.
4. Delete action opens confirmation before calling delete.

### Verification Commands

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Run `pnpm test` if new tests are added or existing test coverage is changed.

## Acceptance Criteria

1. Right-clicking a Markdown file in the file tree shows `新建提醒事项`.
2. Clicking `新建提醒事项` opens a reminder editor bound to that file.
3. The editor captures title, date, time, and repeat settings.
4. The repeat selector includes the requested preset list.
5. Selecting custom repeat opens a smaller custom repeat dialog.
6. Custom repeat can configure at least "every N days", and supports day/week/month/year intervals.
7. A reminder due at the selected date and time triggers a native desktop notification.
8. The notification displays the reminder title and bound file name.
9. Clicking the notification opens the bound file in a new window.
10. A title-bar reminders icon is visible with a tooltip.
11. Clicking the title-bar icon opens the reminders list dialog.
12. The list dialog supports search.
13. The list dialog has Today, All, and Completed tabs.
14. Reminder rows support context menu actions for delete, complete, and edit.
15. Delete requires a second confirmation.
16. Edit opens the same reminder editor dialog with existing data.

## Implementation Files

Likely files to add:

1. `src/main/reminders.ts`
2. `src/main/ipc/reminder.ipc.ts`
3. `src/preload/api/reminder.api.ts`
4. `src/renderer/src/store/reminder.store.ts`
5. `src/renderer/src/features/reminders/index.ts`
6. `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`
7. `src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx`
8. `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`
9. Tests for repeat scheduling and selected UI behavior.

Likely files to modify:

1. `src/shared/constants/ipc-channels.ts`
2. `src/shared/types/index.ts`
3. `src/main/ipc/index.ts`
4. `src/preload/index.ts`
5. `src/renderer/src/types/electron.d.ts`
6. `src/renderer/src/app/App.tsx`
7. `src/renderer/src/components/layout/title-bar.tsx`
8. `src/renderer/src/features/file-tree/components/file-tree.tsx`
9. `src/renderer/src/hooks/use-electron.ts`

## Open Decisions

1. The visual treatment should be close to macOS Reminders but adapted to the existing app theme and component system.
2. The first iteration binds reminders only to Markdown files.
3. The first iteration does not persist reminders in Markdown content.
4. The first iteration does not implement advanced recurrence endings.
