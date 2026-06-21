# File Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build file-bound reminders with creation from the file tree, Reminders-like editing, custom repeat rules, native notifications, and a searchable title-bar reminders list.

**Architecture:** Reminder data, scheduling, and native notifications live in the Electron main process. Renderer state mirrors main-process data through narrow preload APIs and uses existing Radix UI primitives for dialogs, tabs, context menus, and confirmations.

**Tech Stack:** Electron, Vite, React 19, TypeScript, Zustand, Radix UI, Lucide React, Vitest, dayjs

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/shared/types/index.ts` | Shared reminder data contracts |
| `src/shared/constants/ipc-channels.ts` | Reminder IPC channel names |
| `src/main/reminders.ts` | Storage, validation, repeat calculation, scheduling, notifications |
| `src/main/reminders.test.ts` | Main-process reminder service and recurrence tests |
| `src/main/ipc/reminder.ipc.ts` | IPC handlers and change-event fan-out |
| `src/main/ipc/index.ts` | Register reminder IPC |
| `src/preload/api/reminder.api.ts` | Renderer-safe reminder bridge |
| `src/preload/index.ts` | Expose reminder API |
| `src/renderer/src/types/electron.d.ts` | Renderer Electron API typings |
| `src/renderer/src/hooks/use-electron.ts` | Reminder methods in existing hook |
| `src/renderer/src/store/reminder.store.ts` | Renderer reminder UI/data store |
| `src/renderer/src/features/reminders/index.ts` | Feature exports |
| `src/renderer/src/features/reminders/lib/reminder-format.ts` | Repeat labels, dates, filtering helpers |
| `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx` | Create/edit reminder dialog |
| `src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx` | Custom repeat dialog |
| `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx` | Searchable reminders list with tabs and context menu |
| `src/renderer/src/app/App.tsx` | Load reminders and mount global dialogs |
| `src/renderer/src/components/layout/title-bar.tsx` | Add reminders icon and tooltip |
| `src/renderer/src/features/file-tree/components/file-tree.tsx` | Add Markdown file context menu action |

## Task 1: Shared Reminder Contracts

**Files:**
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/constants/ipc-channels.ts`

- [ ] **Step 1: Add reminder shared types**

Add these exports near the other shared app contracts in `src/shared/types/index.ts`:

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

- [ ] **Step 2: Add reminder IPC channels**

Add this group to `IPC_CHANNELS` in `src/shared/constants/ipc-channels.ts`:

```ts
REMINDER: {
  LIST: "reminder:list",
  CREATE: "reminder:create",
  UPDATE: "reminder:update",
  DELETE: "reminder:delete",
  COMPLETE: "reminder:complete",
  ON_CHANGED: "reminder:on-changed",
},
```

- [ ] **Step 3: Run typecheck for shared edits**

Run: `pnpm typecheck`

Expected: it may fail because reminder APIs are not implemented yet. The shared type/channel changes themselves should not introduce syntax errors.

## Task 2: Main Reminder Service With Tests

**Files:**
- Create: `src/main/reminders.ts`
- Create: `src/main/reminders.test.ts`

- [ ] **Step 1: Write failing recurrence and CRUD tests**

Create `src/main/reminders.test.ts` with tests for:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ReminderInput } from "../shared/types";
import {
  ReminderService,
  calculateNextReminderDate,
  createReminderId,
} from "./reminders";

const baseInput: ReminderInput = {
  title: "Read notes",
  filePath: "/workspace/notes/today.md",
  scheduledAt: "2026-06-21T09:00:00.000Z",
  repeat: "never",
};

describe("calculateNextReminderDate", () => {
  it("calculates daily repeats", () => {
    expect(
      calculateNextReminderDate(new Date("2026-06-21T09:00:00.000Z"), {
        repeat: "daily",
      }).toISOString(),
    ).toBe("2026-06-22T09:00:00.000Z");
  });

  it("calculates custom day intervals", () => {
    expect(
      calculateNextReminderDate(new Date("2026-06-21T09:00:00.000Z"), {
        repeat: "custom",
        customRepeat: { interval: 3, unit: "day" },
      }).toISOString(),
    ).toBe("2026-06-24T09:00:00.000Z");
  });
});

describe("ReminderService", () => {
  it("creates reminders with derived file names", async () => {
    const saved: unknown[] = [];
    const service = new ReminderService({
      readReminders: async () => [],
      writeReminders: async (reminders) => saved.push(reminders),
      now: () => new Date("2026-06-21T08:00:00.000Z"),
      createId: () => createReminderId("test"),
      scheduleTimer: () => ({ dispose: vi.fn() }),
      showNotification: vi.fn(),
      openFileInNewWindow: vi.fn(),
    });

    const reminder = await service.create(baseInput);

    expect(reminder.fileName).toBe("today.md");
    expect(reminder.completed).toBe(false);
    expect(saved).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm test src/main/reminders.test.ts`

Expected: FAIL because `src/main/reminders.ts` does not exist yet.

- [ ] **Step 3: Implement the service**

Create `src/main/reminders.ts` with:

```ts
import { basename, join } from "node:path";
import fs from "node:fs";
import { app, BrowserWindow, Notification } from "electron";
import type {
  Reminder,
  ReminderInput,
  ReminderRepeatCustomRule,
  ReminderRepeatPreset,
  ReminderRepeatUnit,
} from "../shared/types";
import { openPathInNewWindow } from "./window";

const MAX_TIMER_DELAY = 2_147_483_647;

export interface TimerHandle {
  dispose: () => void;
}

export interface ReminderServiceDeps {
  readReminders?: () => Promise<Reminder[]>;
  writeReminders?: (reminders: Reminder[]) => Promise<void>;
  now?: () => Date;
  createId?: () => string;
  scheduleTimer?: (callback: () => void, delay: number) => TimerHandle;
  showNotification?: (
    reminder: Reminder,
    onClick: () => void,
  ) => { show: () => void };
  openFileInNewWindow?: (filePath: string) => Promise<boolean>;
  broadcast?: (reminders: Reminder[]) => void;
}

export function createReminderId(prefix = "reminder"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getReminderStoragePath(): string {
  return join(app.getPath("userData"), "reminders.json");
}

export async function readReminderFile(): Promise<Reminder[]> {
  try {
    const content = await fs.promises.readFile(getReminderStoragePath(), "utf-8");
    const parsed = JSON.parse(content) as Reminder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to read reminders:", error);
    }
    return [];
  }
}

export async function writeReminderFile(reminders: Reminder[]): Promise<void> {
  await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
  await fs.promises.writeFile(
    getReminderStoragePath(),
    JSON.stringify(reminders, null, 2),
    "utf-8",
  );
}

function addDatePart(date: Date, unit: ReminderRepeatUnit, interval: number): Date {
  const next = new Date(date);
  if (unit === "day") next.setDate(next.getDate() + interval);
  if (unit === "week") next.setDate(next.getDate() + interval * 7);
  if (unit === "month") next.setMonth(next.getMonth() + interval);
  if (unit === "year") next.setFullYear(next.getFullYear() + interval);
  return next;
}

function nextMatchingDay(date: Date, matches: (day: number) => boolean): Date {
  let next = addDatePart(date, "day", 1);
  while (!matches(next.getDay())) {
    next = addDatePart(next, "day", 1);
  }
  return next;
}

export function calculateNextReminderDate(
  from: Date,
  rule: { repeat: ReminderRepeatPreset; customRepeat?: ReminderRepeatCustomRule },
): Date {
  switch (rule.repeat) {
    case "daily":
      return addDatePart(from, "day", 1);
    case "weekdays":
      return nextMatchingDay(from, (day) => day >= 1 && day <= 5);
    case "weekends":
      return nextMatchingDay(from, (day) => day === 0 || day === 6);
    case "weekly":
      return addDatePart(from, "week", 1);
    case "biweekly":
      return addDatePart(from, "week", 2);
    case "monthly":
      return addDatePart(from, "month", 1);
    case "quarterly":
      return addDatePart(from, "month", 3);
    case "semiannual":
      return addDatePart(from, "month", 6);
    case "yearly":
      return addDatePart(from, "year", 1);
    case "custom": {
      const custom = rule.customRepeat ?? { interval: 1, unit: "day" as const };
      return addDatePart(from, custom.unit, Math.max(1, custom.interval));
    }
    case "never":
      return from;
  }
}
```

Continue the same file with `ReminderService` methods: `load`, `list`, `create`, `update`, `delete`, `complete`, `scheduleAll`, `handleDueReminder`, and `emitChange`. Inject dependencies for tests and use Electron defaults in production.

- [ ] **Step 4: Run service tests**

Run: `pnpm test src/main/reminders.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit service**

```bash
git add src/main/reminders.ts src/main/reminders.test.ts
git commit -m "feat: add reminder service"
```

## Task 3: Reminder IPC And Preload API

**Files:**
- Create: `src/main/ipc/reminder.ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Create: `src/preload/api/reminder.api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/renderer/src/hooks/use-electron.ts`

- [ ] **Step 1: Add IPC handlers**

Create `src/main/ipc/reminder.ipc.ts`:

```ts
import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ReminderInput } from "../../shared/types";
import { reminderService } from "../reminders";

function broadcastReminders(): void {
  const reminders = reminderService.getSnapshot();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.REMINDER.ON_CHANGED, reminders);
    }
  });
}

export async function initializeReminderIpc(): Promise<void> {
  await reminderService.load();
  reminderService.setBroadcast(broadcastReminders);
}

export function registerReminderIpc(): void {
  ipcMain.handle(IPC_CHANNELS.REMINDER.LIST, async () => reminderService.list());
  ipcMain.handle(IPC_CHANNELS.REMINDER.CREATE, async (_, input: ReminderInput) =>
    reminderService.create(input),
  );
  ipcMain.handle(
    IPC_CHANNELS.REMINDER.UPDATE,
    async (_, id: string, input: Partial<ReminderInput>) =>
      reminderService.update(id, input),
  );
  ipcMain.handle(IPC_CHANNELS.REMINDER.DELETE, async (_, id: string) =>
    reminderService.delete(id),
  );
  ipcMain.handle(IPC_CHANNELS.REMINDER.COMPLETE, async (_, id: string) =>
    reminderService.complete(id),
  );
}
```

- [ ] **Step 2: Register reminder IPC**

Modify `src/main/ipc/index.ts` to import and call `registerReminderIpc`.

Modify `src/main/index.ts` to call `initializeReminderIpc()` during app ready after IPC registration.

- [ ] **Step 3: Add preload API**

Create `src/preload/api/reminder.api.ts`:

```ts
import { ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { Reminder, ReminderInput } from "../../shared/types";

export const reminderApi = {
  listReminders: (): Promise<Reminder[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDER.LIST),
  createReminder: (input: ReminderInput): Promise<Reminder> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDER.CREATE, input),
  updateReminder: (
    id: string,
    input: Partial<ReminderInput>,
  ): Promise<Reminder> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDER.UPDATE, id, input),
  deleteReminder: (id: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDER.DELETE, id),
  completeReminder: (id: string): Promise<Reminder> =>
    ipcRenderer.invoke(IPC_CHANNELS.REMINDER.COMPLETE, id),
  onRemindersChanged: (callback: (reminders: Reminder[]) => void) => {
    const handler = (_event: IpcRendererEvent, reminders: Reminder[]) => {
      callback(reminders);
    };
    ipcRenderer.on(IPC_CHANNELS.REMINDER.ON_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.REMINDER.ON_CHANGED, handler);
    };
  },
};
```

- [ ] **Step 4: Expose API and typings**

Import `reminderApi` in `src/preload/index.ts` and spread it into `api`.

Add matching methods to `ElectronAPI` in `src/renderer/src/types/electron.d.ts`.

Add wrapper callbacks in `src/renderer/src/hooks/use-electron.ts`.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS after all IPC and typings are connected.

- [ ] **Step 6: Commit IPC and preload**

```bash
git add src/shared/constants/ipc-channels.ts src/shared/types/index.ts src/main/ipc/reminder.ipc.ts src/main/ipc/index.ts src/main/index.ts src/preload/api/reminder.api.ts src/preload/index.ts src/renderer/src/types/electron.d.ts src/renderer/src/hooks/use-electron.ts
git commit -m "feat: expose reminder ipc"
```

## Task 4: Renderer Reminder Store And Helpers

**Files:**
- Create: `src/renderer/src/store/reminder.store.ts`
- Create: `src/renderer/src/features/reminders/lib/reminder-format.ts`
- Create: `src/renderer/src/features/reminders/index.ts`

- [ ] **Step 1: Create formatting helpers**

Create helper functions for repeat labels, local date grouping, search filtering, and default scheduled time.

```ts
export function getRepeatLabel(reminder: Pick<Reminder, "repeat" | "customRepeat">): string {
  if (reminder.repeat === "never") return "永不";
  if (reminder.repeat === "daily") return "每天";
  if (reminder.repeat === "weekdays") return "工作日";
  if (reminder.repeat === "weekends") return "周末";
  if (reminder.repeat === "weekly") return "每周";
  if (reminder.repeat === "biweekly") return "每两周";
  if (reminder.repeat === "monthly") return "每月";
  if (reminder.repeat === "quarterly") return "每 3 个月";
  if (reminder.repeat === "semiannual") return "每 6 个月";
  if (reminder.repeat === "yearly") return "每年";
  const unit = reminder.customRepeat?.unit ?? "day";
  const interval = reminder.customRepeat?.interval ?? 1;
  const unitLabel = { day: "天", week: "周", month: "月", year: "年" }[unit];
  return `每 ${interval} ${unitLabel}`;
}
```

- [ ] **Step 2: Create reminder store**

Create a Zustand store with `loadReminders`, `subscribeToReminderChanges`, `openCreateDialog`, `openEditDialog`, `closeEditor`, `openList`, `closeList`, `createReminder`, `updateReminder`, `deleteReminder`, and `completeReminder`.

- [ ] **Step 3: Export feature components**

Create `src/renderer/src/features/reminders/index.ts` that exports the upcoming dialogs and helper types.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

Expected: it may fail until components exist and exports are complete. Store/helper syntax should be clean.

- [ ] **Step 5: Commit store and helpers**

```bash
git add src/renderer/src/store/reminder.store.ts src/renderer/src/features/reminders/lib/reminder-format.ts src/renderer/src/features/reminders/index.ts
git commit -m "feat: add reminder renderer store"
```

## Task 5: Reminder Editor And Custom Repeat UI

**Files:**
- Create: `src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx`
- Create: `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`
- Modify: `src/renderer/src/features/reminders/index.ts`

- [ ] **Step 1: Build custom repeat dialog**

Use `Dialog`, `Button`, `Input`, and compact rows matching the reference. Validate interval as an integer greater than zero. Confirm returns `{ interval, unit }`.

- [ ] **Step 2: Build reminder editor dialog**

Use controlled title, date, time, repeat, and custom repeat state. On save, compose `scheduledAt` from date and time, then call create or update through `useReminderStore`.

Include Chinese comments around the core save and date/time composition logic.

- [ ] **Step 3: Export dialogs**

Update `src/renderer/src/features/reminders/index.ts` to export `ReminderEditorDialog`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS for the new components.

- [ ] **Step 5: Commit editor UI**

```bash
git add src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/index.ts
git commit -m "feat: add reminder editor dialog"
```

## Task 6: Reminder List UI And Global Mounting

**Files:**
- Create: `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`
- Modify: `src/renderer/src/features/reminders/index.ts`
- Modify: `src/renderer/src/app/App.tsx`
- Modify: `src/renderer/src/components/layout/title-bar.tsx`

- [ ] **Step 1: Build reminder list dialog**

Use `Tabs`, `ContextMenu`, `ConfirmDialog`, and existing theme variables. Implement Today, All, Completed filters and search by title or file name.

- [ ] **Step 2: Mount global reminder dialogs**

In `App.tsx`, subscribe to reminder changes on startup and render `ReminderEditorDialog` and `ReminderListDialog` inside the existing provider tree.

- [ ] **Step 3: Add title-bar reminders icon**

Add a Lucide `Bell` icon button near Git/theme/settings in `title-bar.tsx`. Use tooltip text `提醒事项` and call `useReminderStore.getState().openList()`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit list UI**

```bash
git add src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/index.ts src/renderer/src/app/App.tsx src/renderer/src/components/layout/title-bar.tsx
git commit -m "feat: add reminder list entry"
```

## Task 7: File Tree Integration

**Files:**
- Modify: `src/renderer/src/features/file-tree/components/file-tree.tsx`

- [ ] **Step 1: Add create-reminder context action**

Import `BellPlus` and `useReminderStore`. Add `新建提醒事项` to Markdown file context menus only. The action calls `openCreateDialog(flatNode.key)`.

- [ ] **Step 2: Keep folder menus unchanged**

Ensure folders do not show `新建提醒事项`.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Commit file tree integration**

```bash
git add src/renderer/src/features/file-tree/components/file-tree.tsx
git commit -m "feat: add file reminder action"
```

## Task 8: Verification

**Files:**
- Modify tests only if failures expose missing coverage or broken assumptions.

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 5: Manual smoke check**

Run: `pnpm dev`

Expected manual checks:
- Right-click a Markdown file and see `新建提醒事项`.
- Create a reminder with title/date/time/repeat.
- Open title-bar reminders list and see the reminder.
- Search by title and file name.
- Use Today, All, and Completed tabs.
- Edit, complete, and delete with confirmation.
- Create a near-future reminder and verify native notification appears.
- Click notification and verify the file opens in a new window.

## Plan Self-Review

Spec coverage:
- File-tree right-click creation: Task 7.
- Reminder editor fields: Task 5.
- Repeat presets and custom repeat: Tasks 2 and 5.
- Native notification and notification click: Task 2.
- Title-bar icon and tooltip: Task 6.
- Searchable Today/All/Completed list: Task 6.
- List context menu delete/complete/edit: Task 6.
- Delete confirmation: Task 6.

Placeholder scan:
- No TBD/TODO placeholders.
- Each task has concrete file paths and verification commands.

Type consistency:
- Shared `Reminder`, `ReminderInput`, `ReminderRepeatPreset`, and `ReminderRepeatCustomRule` names match all later tasks.
- IPC channel names match preload and main-process tasks.
