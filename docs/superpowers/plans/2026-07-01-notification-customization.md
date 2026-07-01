# Notification Customization Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted notification appearance settings for icon visibility, app title style, bottom actions, background color, and preset notification size.

**Architecture:** Shared notification config owns the new fields and default values. The main process normalizes old saved config, synchronizes desktop config into `DesktopChannel`, and passes the same visual options to test and reminder notifications. The renderer settings page edits the existing notification store through focused controls.

**Tech Stack:** Electron, Vite, React 19, TypeScript, Zustand, Lucide React, Vitest, Testing Library, existing `ColorPicker`, existing `Switch`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/shared/types/index.ts` | Add `NotificationSizePreset`, extend `DesktopChannelConfig`, and define default visual values |
| `src/renderer/src/types/index.ts` | Re-export `NotificationSizePreset` for renderer code |
| `src/main/notification-channels/desktop.channel.ts` | Store the latest desktop config and pass it to `createAppNotification` for test and channel notifications |
| `src/main/notification-channels/manager.ts` | Synchronize normalized desktop config into `DesktopChannel` after construction, load, update, and save |
| `src/main/notification-channels/desktop.channel.test.ts` | Cover desktop channel visual config forwarding |
| `src/main/app-notification.ts` | Apply visual options to generated HTML and size presets to window bounds |
| `src/main/app-notification.test.ts` | Cover HTML rendering and window bounds for visual options |
| `src/main/reminders.ts` | Pass full desktop visual config into reminder notifications |
| `src/main/reminders.test.ts` | Cover reminder notification visual config forwarding |
| `src/renderer/src/features/settings/components/notification-settings.tsx` | Add settings controls below the existing notification title row |
| `src/renderer/src/features/settings/components/notification-settings.test.tsx` | Cover renderer setting updates |

## Task 1: Shared Config and Desktop Channel Synchronization

**Files:**
- Modify: `src/shared/types/index.ts`
- Modify: `src/renderer/src/types/index.ts`
- Modify: `src/main/notification-channels/desktop.channel.ts`
- Modify: `src/main/notification-channels/manager.ts`
- Test: `src/main/notification-channels/desktop.channel.test.ts`

- [ ] **Step 1: Write failing desktop channel tests**

Add this import and constant to `src/main/notification-channels/desktop.channel.test.ts`:

```ts
import { DEFAULT_NOTIFICATION_CONFIG } from "../../shared/types";

const customizedDesktopConfig = {
  ...DEFAULT_NOTIFICATION_CONFIG.desktop,
  appName: "Personal Notes",
  showAppIcon: false,
  appNameFontSize: 22,
  appNameColor: "#ffcc66",
  showActions: false,
  backgroundColor: "#223344",
  sizePreset: "large" as const,
};
```

Update the test channel case:

```ts
it("shows a test desktop notification with the custom notification window", async () => {
  const channel = new DesktopChannel();
  channel.updateConfig(customizedDesktopConfig);

  await expect(channel.test()).resolves.toEqual({ success: true });

  expect(appNotificationMocks.show).toHaveBeenCalledTimes(1);
  expect(createAppNotification).toHaveBeenCalledWith({
    ...customizedDesktopConfig,
    title: "Keep Notes 测试通知",
    body: "系统桌面通知已触发",
    openLabel: "查看详情",
  });
  expect(electronMocks.show).not.toHaveBeenCalled();
});
```

Update the send case:

```ts
it("sends reminder desktop notifications", async () => {
  const channel = new DesktopChannel();
  channel.updateConfig(customizedDesktopConfig);

  await channel.send(reminder);

  expect(appNotificationMocks.show).toHaveBeenCalledTimes(1);
  expect(createAppNotification).toHaveBeenCalledWith({
    ...customizedDesktopConfig,
    title: "Read notes",
    body: "today.md",
    openLabel: "查看详情",
  });
  expect(electronMocks.show).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the desktop channel tests and verify RED**

Run:

```bash
pnpm test src/main/notification-channels/desktop.channel.test.ts
```

Expected: FAIL because `DesktopChannel` has no `updateConfig` method and `createAppNotification` does not receive the custom visual fields.

- [ ] **Step 3: Extend shared notification config**

In `src/shared/types/index.ts`, add the size preset type before `DesktopChannelConfig`:

```ts
export type NotificationSizePreset = "small" | "medium" | "large";
```

Replace `DesktopChannelConfig` with:

```ts
export interface DesktopChannelConfig {
  enabled: boolean;
  requireInteraction: boolean;
  appName: string;
  showAppIcon: boolean;
  appNameFontSize: number;
  appNameColor: string;
  showActions: boolean;
  backgroundColor: string;
  sizePreset: NotificationSizePreset;
}
```

Replace the desktop default with:

```ts
desktop: {
  enabled: true,
  requireInteraction: false,
  appName: APP_NAME,
  showAppIcon: true,
  appNameFontSize: 18,
  appNameColor: "",
  showActions: true,
  backgroundColor: "#111820",
  sizePreset: "medium",
},
```

In `src/renderer/src/types/index.ts`, add `NotificationSizePreset` to the type export list:

```ts
NotificationSizePreset,
```

- [ ] **Step 4: Add desktop config storage to `DesktopChannel`**

In `src/main/notification-channels/desktop.channel.ts`, update imports:

```ts
import type { DesktopChannelConfig, Reminder } from "../../shared/types";
import { DEFAULT_NOTIFICATION_CONFIG } from "../../shared/types";
```

Replace `showDesktopNotification` with:

```ts
async function showDesktopNotification(
  config: DesktopChannelConfig,
  title: string,
  body?: string,
): Promise<void> {
  await createAppNotification({
    ...config,
    title,
    body,
    openLabel: "查看详情",
  }).show();
}
```

Add config state and updater inside `DesktopChannel`:

```ts
export class DesktopChannel implements NotificationChannel {
  type = "desktop" as const;
  private config: DesktopChannelConfig = {
    ...DEFAULT_NOTIFICATION_CONFIG.desktop,
  };

  updateConfig(config: DesktopChannelConfig): void {
    this.config = { ...config };
  }
```

Update `send`:

```ts
async send(reminder: Reminder): Promise<void> {
  await showDesktopNotification(
    this.config,
    reminder.title,
    reminder.fileName || undefined,
  );
}
```

Update `test`:

```ts
await showDesktopNotification(
  this.config,
  "Keep Notes 测试通知",
  "系统桌面通知已触发",
);
```

- [ ] **Step 5: Synchronize desktop config in the manager**

In `src/main/notification-channels/manager.ts`, update `updateConfig`:

```ts
updateConfig(config: NotificationConfig): void {
  this.config = this.normalizeConfig(config);
  this.desktopChannel.updateConfig(this.config.desktop);
  this.emailChannel.updateConfig(this.config.email);
}
```

In `loadConfig`, replace the two direct assignment blocks with:

```ts
this.updateConfig(parsed as Partial<NotificationConfig> as NotificationConfig);
```

Keep the old-file compatibility by preserving `normalizeConfig`. The cast is acceptable because `normalizeConfig` fills missing fields.

In the constructor, after channels are registered, add:

```ts
this.desktopChannel.updateConfig(this.config.desktop);
```

- [ ] **Step 6: Run desktop channel tests and verify GREEN**

Run:

```bash
pnpm test src/main/notification-channels/desktop.channel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/shared/types/index.ts src/renderer/src/types/index.ts src/main/notification-channels/desktop.channel.ts src/main/notification-channels/manager.ts src/main/notification-channels/desktop.channel.test.ts
git commit -m "feat: persist notification visual config"
```

## Task 2: App Notification Rendering and Size Presets

**Files:**
- Modify: `src/main/app-notification.ts`
- Test: `src/main/app-notification.test.ts`

- [ ] **Step 1: Add a helper in the test file to decode HTML**

In `src/main/app-notification.test.ts`, add this helper above `describe`:

```ts
function getLastNotificationHtml(): string {
  const win = electronMocks.getLastWindow();
  const [dataUrl] = win.loadURL.mock.calls[0] as [string];
  return Buffer.from(
    dataUrl.replace("data:text/html;base64,", ""),
    "base64",
  ).toString("utf-8");
}
```

- [ ] **Step 2: Write failing HTML customization test**

Add:

```ts
it("applies notification visual customization options", async () => {
  const notification = createAppNotification({
    appName: "Personal Notes",
    title: "Task Reminder",
    body: "today.md",
    openLabel: "View Details",
    showAppIcon: false,
    appNameFontSize: 22,
    appNameColor: "#ffcc66",
    showActions: false,
    backgroundColor: "#223344",
    sizePreset: "large",
  });

  await notification.show();
  const html = getLastNotificationHtml();

  expect(html).not.toContain('class="app-icon"');
  expect(html).toContain("--app-name-font-size: 22px;");
  expect(html).toContain("--app-name-color: #ffcc66;");
  expect(html).toContain("--notification-bg: #223344;");
  expect(html).toContain("grid-template-columns: 1fr;");
  expect(html).not.toContain('<div class="actions">');
  expect(html).not.toContain("View Details");
});
```

- [ ] **Step 3: Write failing size preset test**

Add:

```ts
it("uses the requested large notification size preset", async () => {
  const notification = createAppNotification({
    title: "Task Reminder",
    sizePreset: "large",
  });

  await notification.show();
  const win = electronMocks.getLastWindow();
  const windowOptions = win.options as {
    width: number;
    height: number;
    y: number;
  };

  if (process.platform === "darwin") {
    expect(windowOptions).toMatchObject({ width: 400, height: 168, y: 24 });
  } else {
    expect(windowOptions).toMatchObject({ width: 440, height: 220, y: 672 });
  }
});
```

- [ ] **Step 4: Run app notification tests and verify RED**

Run:

```bash
pnpm test src/main/app-notification.test.ts
```

Expected: FAIL because the new HTML CSS variables, icon hiding, actions hiding, and large preset sizing do not exist yet.

- [ ] **Step 5: Extend app notification options**

In `src/main/app-notification.ts`, add the type import:

```ts
import type { NotificationSizePreset } from "../shared/types";
```

Extend `AppNotificationOptions`:

```ts
showAppIcon?: boolean;
appNameFontSize?: number;
appNameColor?: string;
showActions?: boolean;
backgroundColor?: string;
sizePreset?: NotificationSizePreset;
```

- [ ] **Step 6: Add normalization helpers**

Add below `escapeHtml`:

```ts
function isHexColor(value: string | undefined): value is string {
  return Boolean(value && /^#[0-9A-Fa-f]{6}$/.test(value));
}

function clampFontSize(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 18;
  return Math.min(28, Math.max(12, Math.round(value)));
}

function getSizePreset(value: NotificationSizePreset | undefined) {
  return value === "small" || value === "large" ? value : "medium";
}
```

- [ ] **Step 7: Replace fixed size constants with preset maps**

Replace the width and height constants with:

```ts
const MAC_NOTIFICATION_SIZES: Record<
  NotificationSizePreset,
  { width: number; height: number }
> = {
  small: { width: 320, height: 128 },
  medium: { width: 356, height: 144 },
  large: { width: 400, height: 168 },
};

const WINDOWS_NOTIFICATION_SIZES: Record<
  NotificationSizePreset,
  { width: number; height: number }
> = {
  small: { width: 340, height: 160 },
  medium: { width: 384, height: 188 },
  large: { width: 440, height: 220 },
};
```

Keep the existing margin constants.

- [ ] **Step 8: Apply visual CSS variables and conditional markup**

Inside `createNotificationHtml`, add normalized values after `iconUrl`:

```ts
const showAppIcon = options.showAppIcon !== false;
const showActions = options.showActions !== false;
const appNameFontSize = clampFontSize(options.appNameFontSize);
const appNameLineHeight = appNameFontSize + 4;
const appNameColor = isHexColor(options.appNameColor)
  ? options.appNameColor
  : "inherit";
const backgroundColor = isHexColor(options.backgroundColor)
  ? options.backgroundColor
  : "#111820";
const contentClass = showAppIcon ? "content" : "content without-icon";
```

Add this CSS inside the `<style>` block before `* { box-sizing: border-box; }`:

```css
:root {
  --app-name-font-size: ${appNameFontSize}px;
  --app-name-line-height: ${appNameLineHeight}px;
  --app-name-color: ${appNameColor};
  --notification-bg: ${backgroundColor};
}
```

Add generic no-icon CSS after `.content`:

```css
.content.without-icon {
  grid-template-columns: 1fr;
}
```

Update `.app-name` base values:

```css
font-size: var(--app-name-font-size);
line-height: var(--app-name-line-height);
color: var(--app-name-color);
```

In `.platform-windows .notification`, replace the current `background:` value with:

```css
background: var(--notification-bg);
```

In `.platform-mac .notification`, append `background: var(--notification-bg);` after the existing gradient background so the user color wins.

Replace body markup:

```html
<div class="${contentClass}">
  ${showAppIcon ? `<img class="app-icon" src="${iconUrl}" alt="" aria-hidden="true" />` : ""}
```

Replace the actions block with:

```html
${showActions ? `<div class="actions">
  <a class="button" href="${snoozeAction}"><svg class="clock-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.6" stroke="currentColor" stroke-width="1.8" /><path d="M12 7.2V12l3.4 2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><circle cx="12" cy="12" r="1.15" fill="currentColor" /></svg><span>${confirmLabel}</span></a>
  ${options.openLabel ? `<a class="button primary" href="${openAction}">${openLabel}</a>` : ""}
</div>` : ""}
```

- [ ] **Step 9: Use size presets in bounds**

Change the bounds helper signature:

```ts
function getNotificationBounds(
  sizePreset: NotificationSizePreset | undefined,
): Electron.Rectangle {
```

Inside it, replace width and height selection:

```ts
const preset = getSizePreset(sizePreset);
const size = IS_MAC
  ? MAC_NOTIFICATION_SIZES[preset]
  : WINDOWS_NOTIFICATION_SIZES[preset];
const { width, height } = size;
```

Update the `BrowserWindow` creation call:

```ts
...getNotificationBounds(options.sizePreset),
```

- [ ] **Step 10: Run app notification tests and verify GREEN**

Run:

```bash
pnpm test src/main/app-notification.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit Task 2**

```bash
git add src/main/app-notification.ts src/main/app-notification.test.ts
git commit -m "feat: customize notification window appearance"
```

## Task 3: Reminder Notification Config Forwarding

**Files:**
- Modify: `src/main/reminders.ts`
- Test: `src/main/reminders.test.ts`

- [ ] **Step 1: Write failing reminder forwarding test update**

In `src/main/reminders.test.ts`, find the existing test named `passes persistent desktop notification preference to the notification window`. Update its `notificationConfig.desktop` fixture to include all new fields:

```ts
desktop: {
  enabled: true,
  requireInteraction: true,
  appName: "Personal Reminder",
  showAppIcon: false,
  appNameFontSize: 22,
  appNameColor: "#ffcc66",
  showActions: false,
  backgroundColor: "#223344",
  sizePreset: "large",
},
```

Update the expected options object:

```ts
{
  appName: "Personal Reminder",
  requireInteraction: true,
  showAppIcon: false,
  appNameFontSize: 22,
  appNameColor: "#ffcc66",
  showActions: false,
  backgroundColor: "#223344",
  sizePreset: "large",
}
```

- [ ] **Step 2: Run reminder tests and verify RED**

Run:

```bash
pnpm test src/main/reminders.test.ts
```

Expected: FAIL because `ReminderNotificationOptions` and the call site only forward `appName` and `requireInteraction`.

- [ ] **Step 3: Pass the full desktop visual config**

In `src/main/reminders.ts`, replace `ReminderNotificationOptions` with:

```ts
type ReminderNotificationOptions = NotificationConfig["desktop"];
```

In `createDefaultNotification`, add all visual fields to `createAppNotification` by spreading options first:

```ts
return createAppNotification(
  {
    ...options,
    appName: options.appName,
    title: reminder.title,
    body: reminder.fileName || undefined,
    detail: new Date(reminder.scheduledAt).toLocaleString("zh-CN"),
    openLabel: reminder.filePath ? "查看详情" : undefined,
    requireInteraction: options.requireInteraction,
  },
  onClick,
  onSnooze,
);
```

In `notify`, replace the manually constructed options object:

```ts
config.desktop,
```

- [ ] **Step 4: Run reminder tests and verify GREEN**

Run:

```bash
pnpm test src/main/reminders.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/main/reminders.ts src/main/reminders.test.ts
git commit -m "feat: apply notification visuals to reminders"
```

## Task 4: Renderer Notification Settings Controls

**Files:**
- Modify: `src/renderer/src/features/settings/components/notification-settings.tsx`
- Test: `src/renderer/src/features/settings/components/notification-settings.test.tsx`

- [ ] **Step 1: Write failing renderer tests for new controls**

In `src/renderer/src/features/settings/components/notification-settings.test.tsx`, add:

```tsx
it("updates desktop notification icon visibility", async () => {
  render(<NotificationSettings />);

  const control = await screen.findByLabelText("显示应用图标");
  fireEvent.click(control);

  await waitFor(() => {
    expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
      ...DEFAULT_NOTIFICATION_CONFIG,
      desktop: {
        ...DEFAULT_NOTIFICATION_CONFIG.desktop,
        showAppIcon: false,
      },
    });
  });
});

it("updates desktop notification title size and colors", async () => {
  render(<NotificationSettings />);

  fireEvent.change(await screen.findByLabelText("标题字号"), {
    target: { value: "22" },
  });
  fireEvent.blur(screen.getByLabelText("标题字号"));
  fireEvent.change(screen.getByLabelText("标题颜色"), {
    target: { value: "#ffcc66" },
  });
  fireEvent.change(screen.getByLabelText("通知背景色"), {
    target: { value: "#223344" },
  });

  await waitFor(() => {
    expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith({
      ...DEFAULT_NOTIFICATION_CONFIG,
      desktop: {
        ...DEFAULT_NOTIFICATION_CONFIG.desktop,
        appNameFontSize: 22,
        appNameColor: "#ffcc66",
        backgroundColor: "#223344",
      },
    });
  });
});

it("updates bottom action visibility and notification size preset", async () => {
  render(<NotificationSettings />);

  fireEvent.click(await screen.findByLabelText("显示底部操作"));
  fireEvent.change(screen.getByLabelText("弹窗大小"), {
    target: { value: "large" },
  });

  await waitFor(() => {
    expect(window.electronAPI.setNotificationConfig).toHaveBeenLastCalledWith({
      ...DEFAULT_NOTIFICATION_CONFIG,
      desktop: {
        ...DEFAULT_NOTIFICATION_CONFIG.desktop,
        showActions: false,
        sizePreset: "large",
      },
    });
  });
});
```

- [ ] **Step 2: Run renderer settings tests and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/settings/components/notification-settings.test.tsx
```

Expected: FAIL because the new labels and controls do not exist.

- [ ] **Step 3: Import `ColorPicker` and size type**

In `notification-settings.tsx`, add:

```ts
import { ColorPicker } from "@/components/ui/color-picker";
import type { NotificationSizePreset } from "@/types";
```

- [ ] **Step 4: Add small helper handlers**

Inside `NotificationSettings`, add:

```ts
const clearDesktopResult = () => setDesktopTestResult(null);

const updateDesktopConfig = async (
  desktop: Partial<typeof config.desktop>,
) => {
  await updateConfig({ desktop });
  clearDesktopResult();
};

const handleAppNameFontSizeBlur = async (
  value: string,
  resetValue: (value: string) => void,
) => {
  const nextSize = Math.min(28, Math.max(12, Number(value) || 18));
  resetValue(String(nextSize));
  if (nextSize === config.desktop.appNameFontSize) return;
  await updateDesktopConfig({ appNameFontSize: nextSize });
};
```

Add local state for the size input:

```ts
const [appNameFontSize, setAppNameFontSize] = useState(
  String(config.desktop.appNameFontSize),
);
```

Update the config synchronization effect:

```ts
setAppNameFontSize(String(config.desktop.appNameFontSize));
```

Add `config.desktop.appNameFontSize` to the dependency list.

- [ ] **Step 5: Add controls below notification title**

After the existing notification title row, add:

```tsx
<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow label="显示应用图标" description="控制通知左侧应用图标是否显示">
    <Switch
      aria-label="显示应用图标"
      checked={config.desktop.showAppIcon}
      disabled={!config.desktop.enabled}
      onCheckedChange={(checked) => {
        void updateDesktopConfig({ showAppIcon: checked });
      }}
    />
  </SettingRow>
</div>

<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow label="标题字号" description="应用标题名称的字体大小">
    <input
      aria-label="标题字号"
      type="number"
      min={12}
      max={28}
      value={appNameFontSize}
      disabled={!config.desktop.enabled}
      onChange={(e) => setAppNameFontSize(e.target.value)}
      onBlur={() => {
        void handleAppNameFontSizeBlur(
          appNameFontSize,
          setAppNameFontSize,
        );
      }}
      className="h-8 w-24 rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
        color: "var(--text-primary)",
        outline: "none",
      }}
    />
  </SettingRow>
</div>

<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow label="标题颜色" description="应用标题名称的文字颜色">
    <div aria-label="标题颜色">
      <ColorPicker
        value={config.desktop.appNameColor || "#ffffff"}
        onChange={(color) => {
          void updateDesktopConfig({ appNameColor: color });
        }}
      />
    </div>
  </SettingRow>
</div>

<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow label="显示底部操作" description="控制稍后提醒和查看详情按钮是否显示">
    <Switch
      aria-label="显示底部操作"
      checked={config.desktop.showActions}
      disabled={!config.desktop.enabled}
      onCheckedChange={(checked) => {
        void updateDesktopConfig({ showActions: checked });
      }}
    />
  </SettingRow>
</div>

<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow label="通知背景色" description="应用通知弹窗的背景颜色">
    <div aria-label="通知背景色">
      <ColorPicker
        value={config.desktop.backgroundColor}
        onChange={(color) => {
          void updateDesktopConfig({ backgroundColor: color });
        }}
      />
    </div>
  </SettingRow>
</div>

<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow label="弹窗大小" description="应用通知弹窗的预设尺寸">
    <select
      aria-label="弹窗大小"
      value={config.desktop.sizePreset}
      disabled={!config.desktop.enabled}
      onChange={(e) => {
        void updateDesktopConfig({
          sizePreset: e.target.value as NotificationSizePreset,
        });
      }}
      className="h-8 w-28 rounded-md px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
        color: "var(--text-primary)",
        outline: "none",
      }}
    >
      <option value="small">小</option>
      <option value="medium">默认</option>
      <option value="large">大</option>
    </select>
  </SettingRow>
</div>
```

- [ ] **Step 6: Update existing app name save to use the shared helper**

Replace:

```ts
await updateConfig({ desktop: { appName: nextAppName } });
setDesktopTestResult(null);
```

with:

```ts
await updateDesktopConfig({ appName: nextAppName });
```

Also replace other direct desktop `updateConfig` calls in this component with `updateDesktopConfig` where they update desktop fields.

- [ ] **Step 7: Run renderer settings tests and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/settings/components/notification-settings.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/renderer/src/features/settings/components/notification-settings.tsx src/renderer/src/features/settings/components/notification-settings.test.tsx
git commit -m "feat: add notification appearance settings"
```

## Task 5: Full Verification

**Files:**
- No new code files unless verification finds a defect.

- [ ] **Step 1: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS and produce the normal Electron Vite build output.

- [ ] **Step 4: Commit verification fixes if any were required**

If verification required code fixes, inspect the changed files first:

```bash
git status --short
```

Then stage only the files changed for the verification fix. For example, if the fix touched `src/main/app-notification.ts` and `src/main/app-notification.test.ts`, run:

```bash
git add src/main/app-notification.ts src/main/app-notification.test.ts
git commit -m "fix: polish notification customization"
```

If no fixes were required, do not create a commit for this step.

## Self-Review

- Spec coverage: The plan covers all confirmed settings: icon visibility, title size, title color, bottom action visibility, background color picker, and size preset dropdown. It also covers test and reminder notification flows plus old-config compatibility through normalization.
- Completeness scan: No forbidden marker words or unspecified implementation steps remain.
- Type consistency: The plan consistently uses `NotificationSizePreset`, `DesktopChannelConfig`, `showAppIcon`, `appNameFontSize`, `appNameColor`, `showActions`, `backgroundColor`, and `sizePreset`.
