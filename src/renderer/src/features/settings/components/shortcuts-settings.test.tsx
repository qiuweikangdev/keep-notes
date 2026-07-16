import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShortcutsStore } from "@/store/shortcuts.store";
import { ShortcutsSettings } from "./shortcuts-settings";

describe("ShortcutsSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        setReminderGlobalShortcut: vi.fn(async () => ({
          success: true,
          failedKeys: [],
        })),
      },
    });

    const defaults = useShortcutsStore.getState().defaultShortcuts;
    useShortcutsStore.setState({
      shortcuts: defaults.map((shortcut) => ({ ...shortcut })),
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("shows the default Ctrl+Alt reminder shortcut instead of unassigned", () => {
    render(<ShortcutsSettings />);

    const reminderRow = document.querySelector(
      '[data-shortcut-row="openReminderWindow"]',
    );
    expect(reminderRow).not.toBeNull();
    expect(
      within(reminderRow as HTMLElement).getByText("Ctrl+Alt+R"),
    ).toBeVisible();
    expect(within(reminderRow as HTMLElement).queryByText("未指定")).toBeNull();
  });

  it("uses one grid and consistent keycap sizing for headers and rows", () => {
    render(<ShortcutsSettings />);

    const header = document.querySelector('[data-shortcut-header="true"]');
    const reminderRow = document.querySelector(
      '[data-shortcut-row="openReminderWindow"]',
    );
    const reminderBinding = document.querySelector(
      '[data-shortcut-binding="openReminderWindow"]',
    );
    const keycap = screen.getByText("Ctrl+Alt+R");

    expect(header).toHaveStyle({
      gridTemplateColumns: "minmax(0, 1fr) 200px 64px",
    });
    expect(reminderRow).toHaveStyle({
      gridTemplateColumns: "minmax(0, 1fr) 200px 64px",
    });
    expect(reminderRow).toHaveClass("min-h-[58px]", "gap-x-3");
    expect(reminderBinding).toHaveClass("flex", "items-center");
    expect(keycap).toHaveClass("min-w-[88px]", "justify-center");
  });
});
