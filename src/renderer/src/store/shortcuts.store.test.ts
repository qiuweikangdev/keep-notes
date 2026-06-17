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
