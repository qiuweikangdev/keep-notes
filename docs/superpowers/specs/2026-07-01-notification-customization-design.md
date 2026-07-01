# Notification Customization Settings

## Overview

Extend the custom application notification window with user-configurable visual and layout settings. The existing notification title setting remains, and this iteration adds icon visibility, app title typography, action visibility, background color, and preset window size controls.

The feature should keep the current Electron architecture: notification preferences are stored in the main-process notification configuration, exposed through the existing preload API, edited in the renderer settings page, and applied by the custom notification window HTML generated in the main process.

## Goals

1. Let users choose whether the notification app icon is shown. The default is shown.
2. Let users configure the app title font size.
3. Let users configure the app title color.
4. Let users choose whether bottom actions are shown. This controls "Snooze" and "View Details" together. The default is shown.
5. Let users configure the notification background color through the existing color picker UI.
6. Let users choose a notification window size from a dropdown with small, medium, and large presets. The default is medium.
7. Apply the same settings to test notifications and real reminder notifications.
8. Keep old saved notification configuration files compatible by filling missing fields with defaults.

## Non-Goals

1. Do not add arbitrary custom width and height inputs.
2. Do not add per-button configuration, such as changing only the snooze button or only the details button.
3. Do not redesign the notification layout beyond what is required for the new settings.
4. Do not change the remote email notification behavior.
5. Do not add new dependencies.

## Recommended Approach

Extend `DesktopChannelConfig` with explicit visual settings and pass the whole desktop configuration into the custom app notification window.

This is the smallest durable change because the notification manager already normalizes desktop configuration, the renderer store already merges partial desktop config updates, and both test notifications and reminder notifications already flow through `createAppNotification`.

## Alternatives Considered

### Store only renderer-local preferences

Keep visual settings only in the settings UI and pass them ad hoc when testing.

Pros:
- Minimal shared type changes.

Cons:
- Real reminder notifications would not reliably use the same settings.
- Preferences would not survive outside the renderer store lifecycle.
- It would split notification behavior across renderer and main process.

### Support fully custom width and height

Expose numeric width and height inputs instead of presets.

Pros:
- Maximum flexibility.

Cons:
- Requires validation and clamping.
- Makes it easy to create broken layouts.
- Adds more UI complexity than the current requirement needs.

## Data Model

Extend `DesktopChannelConfig` in `src/shared/types/index.ts`:

```ts
export type NotificationSizePreset = "small" | "medium" | "large";

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

Defaults:

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
}
```

`appNameColor` may use an empty string to keep the platform-specific existing text color. Other color settings should use hex values because the existing `ColorPicker` expects `#RRGGBB`.

## Settings UI

Update `src/renderer/src/features/settings/components/notification-settings.tsx` below the existing notification title row.

Add rows for:

1. App icon visibility: `Switch`.
2. App title size: compact numeric input with a bounded pixel value from 12 to 28.
3. App title color: `ColorPicker`.
4. Bottom actions visibility: `Switch`.
5. Notification background color: `ColorPicker`.
6. Notification window size: native `select` with small, medium, and large labels.

Each setting should be disabled when desktop notifications are disabled, matching the existing title behavior.

The settings should call `updateConfig({ desktop: { ... } })` and clear the desktop test result when changed so users can retest the current appearance.

## Main Process Notification Window

Update `src/main/app-notification.ts` so `AppNotificationOptions` can receive the new visual settings. Use the settings to build safe inline CSS values after validating or normalizing them.

Behavior:

1. Hide the app icon by omitting the `img` element and changing the content grid to one column.
2. Apply `appNameFontSize` to `.app-name` while preserving line-height readability.
3. Apply `appNameColor` only when a valid color is provided.
4. Hide the whole `.actions` block when `showActions` is false.
5. Apply `backgroundColor` as the main notification surface color while keeping the existing border, shadow, and platform shape.
6. Use `sizePreset` in notification bounds calculation.

Suggested Windows medium preset keeps the current `384 x 188`. Small and large should scale conservatively:

| Preset | Windows | macOS |
| --- | --- | --- |
| small | 340 x 160 | 320 x 128 |
| medium | 384 x 188 | 356 x 144 |
| large | 440 x 220 | 400 x 168 |

The platform margin behavior should remain unchanged.

## Notification Flow

Update reminder notification creation in `src/main/reminders.ts` so the full desktop visual settings are passed to `createAppNotification`.

Update desktop test notifications in `src/main/notification-channels/desktop.channel.ts` so the test notification uses the current desktop config as well. `DesktopChannel` should hold the latest desktop config, and `NotificationChannelManager` should synchronize it whenever configuration is loaded, updated, or saved.

## Tests

Update existing focused tests rather than adding broad new suites.

1. `src/main/app-notification.test.ts`
   - Assert the icon can be hidden.
   - Assert bottom actions can be hidden.
   - Assert app title font size, title color, and background color are rendered.
   - Assert size preset affects window bounds.

2. `src/main/notification-channels/desktop.channel.test.ts`
   - Assert test notifications receive desktop visual settings.

3. `src/main/reminders.test.ts`
   - Assert real reminder notifications receive desktop visual settings.

4. `src/renderer/src/features/settings/components/notification-settings.test.tsx`
   - Assert each new setting updates `setNotificationConfig` with the expected desktop field.
   - Assert the size selector renders and saves the selected preset.

## Verification

Run the existing project checks after implementation:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm build`

No dependency installation is required for this feature.
