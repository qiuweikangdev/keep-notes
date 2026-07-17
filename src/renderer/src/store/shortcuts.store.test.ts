import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadShortcutsStore(platform: string) {
  vi.resetModules();
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      getPlatform: () => platform,
    },
  });

  return import("./shortcuts.store");
}

describe("useShortcutsStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("uses only Cmd+Option navigation shortcuts on macOS by default", async () => {
    const { useShortcutsStore } = await loadShortcutsStore("darwin");
    const shortcuts = useShortcutsStore.getState().shortcuts;

    expect(shortcuts.find((item) => item.id === "navigateBack")?.keys).toEqual([
      "CmdOrCtrl+Alt+ArrowLeft",
    ]);
    expect(
      shortcuts.find((item) => item.id === "navigateForward")?.keys,
    ).toEqual(["CmdOrCtrl+Alt+ArrowRight"]);
  });

  it("uses CmdOrCtrl+Shift+B for toggling the sidebar by default", async () => {
    const { useShortcutsStore } = await loadShortcutsStore("darwin");
    const shortcuts = useShortcutsStore.getState().shortcuts;

    expect(shortcuts.find((item) => item.id === "toggleSidebar")?.keys).toEqual(
      ["CmdOrCtrl+Shift+B"],
    );
  });

  it("places the reminder search shortcut first", async () => {
    const { useShortcutsStore } = await loadShortcutsStore("win32");
    const [shortcut, quickEditorShortcut] =
      useShortcutsStore.getState().shortcuts;

    expect(shortcut).toMatchObject({
      id: "openReminderWindow",
      name: "搜索提醒事项",
      keys: ["CmdOrCtrl+Alt+R"],
      isSystem: true,
    });
    expect(quickEditorShortcut).toMatchObject({
      id: "openQuickEditorWindow",
      name: "打开快速编辑",
      keys: ["CmdOrCtrl+Alt+N"],
      isSystem: true,
    });
  });

  it("adds the quick editor shortcut to version 3 persisted settings", async () => {
    localStorage.setItem(
      "shortcuts-storage",
      JSON.stringify({
        state: {
          shortcuts: [
            {
              id: "openReminderWindow",
              name: "搜索提醒事项",
              description: "在浮动小窗口中打开并搜索提醒事项",
              keys: ["CmdOrCtrl+Alt+R"],
              isSystem: true,
            },
          ],
          defaultShortcuts: [],
        },
        version: 3,
      }),
    );

    const { useShortcutsStore } = await loadShortcutsStore("win32");
    const shortcuts = useShortcutsStore.getState().shortcuts;

    expect(shortcuts[1]).toMatchObject({
      id: "openQuickEditorWindow",
      keys: ["CmdOrCtrl+Alt+N"],
    });
  });

  it("appends new defaults before persisted shortcut bindings", async () => {
    localStorage.setItem(
      "shortcuts-storage",
      JSON.stringify({
        state: {
          shortcuts: [
            {
              id: "openSearch",
              name: "打开搜索",
              description: "打开全局文件搜索面板",
              keys: ["CmdOrCtrl+K"],
            },
          ],
          defaultShortcuts: [],
        },
        version: 2,
      }),
    );

    const { useShortcutsStore } = await loadShortcutsStore("win32");
    const state = useShortcutsStore.getState();

    expect(state.shortcuts[0]?.id).toBe("openReminderWindow");
    expect(
      state.shortcuts.find((item) => item.id === "openSearch")?.keys,
    ).toEqual(["CmdOrCtrl+K"]);
  });

  it("migrates the legacy sidebar toggle shortcut away from editor bold", async () => {
    localStorage.setItem(
      "shortcuts-storage",
      JSON.stringify({
        state: {
          shortcuts: [
            {
              id: "toggleSidebar",
              name: "切换侧边栏",
              description: "展开或收起左侧边栏",
              keys: ["CmdOrCtrl+B"],
            },
          ],
          defaultShortcuts: [
            {
              id: "toggleSidebar",
              name: "切换侧边栏",
              description: "展开或收起左侧边栏",
              keys: ["CmdOrCtrl+B"],
            },
          ],
        },
        version: 1,
      }),
    );

    const { useShortcutsStore } = await loadShortcutsStore("darwin");
    const state = useShortcutsStore.getState();

    expect(
      state.shortcuts.find((item) => item.id === "toggleSidebar")?.keys,
    ).toEqual(["CmdOrCtrl+Shift+B"]);
    expect(
      state.defaultShortcuts.find((item) => item.id === "toggleSidebar")?.keys,
    ).toEqual(["CmdOrCtrl+Shift+B"]);
  });

  it("migrates legacy macOS navigation bindings to a single Cmd+Option shortcut", async () => {
    localStorage.setItem(
      "shortcuts-storage",
      JSON.stringify({
        state: {
          shortcuts: [
            {
              id: "navigateBack",
              name: "返回上一个文件",
              description: "切换到历史记录中的上一个文件",
              keys: ["Alt+ArrowLeft", "CmdOrCtrl+Alt+ArrowLeft"],
            },
            {
              id: "navigateForward",
              name: "前进下一个文件",
              description: "切换到历史记录中的下一个文件",
              keys: ["Alt+ArrowRight", "CmdOrCtrl+Alt+ArrowRight"],
            },
          ],
          defaultShortcuts: [
            {
              id: "navigateBack",
              name: "返回上一个文件",
              description: "切换到历史记录中的上一个文件",
              keys: ["Alt+ArrowLeft", "CmdOrCtrl+Alt+ArrowLeft"],
            },
            {
              id: "navigateForward",
              name: "前进下一个文件",
              description: "切换到历史记录中的下一个文件",
              keys: ["Alt+ArrowRight", "CmdOrCtrl+Alt+ArrowRight"],
            },
          ],
        },
        version: 0,
      }),
    );

    const { useShortcutsStore } = await loadShortcutsStore("darwin");
    const state = useShortcutsStore.getState();

    expect(
      state.shortcuts.find((item) => item.id === "navigateBack")?.keys,
    ).toEqual(["CmdOrCtrl+Alt+ArrowLeft"]);
    expect(
      state.shortcuts.find((item) => item.id === "navigateForward")?.keys,
    ).toEqual(["CmdOrCtrl+Alt+ArrowRight"]);
    expect(
      state.defaultShortcuts.find((item) => item.id === "navigateBack")?.keys,
    ).toEqual(["CmdOrCtrl+Alt+ArrowLeft"]);
    expect(
      state.defaultShortcuts.find((item) => item.id === "navigateForward")
        ?.keys,
    ).toEqual(["CmdOrCtrl+Alt+ArrowRight"]);
  });
});
