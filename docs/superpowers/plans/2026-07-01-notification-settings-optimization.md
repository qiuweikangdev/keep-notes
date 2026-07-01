# Notification Settings Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine notification settings copy, split app popup settings from QQ mail push settings, add a native color picker path, and fix small popup clipping.

**Architecture:** Keep the existing settings modal and notification config store. Update renderer UI labels and controls in place, and adjust the main-process notification size presets/CSS without changing IPC contracts.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library.

---

### Task 1: Settings Labels And Native Color Input

**Files:**
- Modify: `src/renderer/src/features/settings/components/settings-modal.tsx`
- Modify: `src/renderer/src/features/settings/components/notification-settings.tsx`
- Modify: `src/renderer/src/components/ui/color-picker.tsx`
- Test: `src/renderer/src/features/settings/components/settings-modal.test.tsx`
- Test: `src/renderer/src/features/settings/components/notification-settings.test.tsx`

- [ ] Add failing tests that expect the settings menu label to read `应用通知配置`, QQ mail settings to appear under a `通知推送` section, and both color controls to expose native color inputs.
- [ ] Change the menu copy and settings content labels.
- [ ] Update `ColorPicker` to include `type="color"` and keep the hex text input.
- [ ] Run the renderer settings tests and commit.

### Task 2: Popup Size Boundary

**Files:**
- Modify: `src/main/app-notification.ts`
- Test: `src/main/app-notification.test.ts`

- [ ] Add a failing test for the Windows `small` preset using a taller minimum height.
- [ ] Increase small preset dimensions and tighten content/action spacing so buttons remain visible.
- [ ] Run the app notification tests and commit.
