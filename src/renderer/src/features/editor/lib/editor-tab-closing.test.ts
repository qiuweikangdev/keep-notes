import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import { CodeResult } from "@/types";
import {
  editorSaveCoordinator,
  registerEditorChangeFlusher,
} from "./editor-runtime";
import { closeEditorTab } from "./editor-tab-closing";

function seedTab(filePath: string | null, content: string): void {
  const group = useEditorStore.getState().panelGroups[0];
  useEditorStore.setState({
    activeGroupId: group.id,
    panelGroups: [
      {
        ...group,
        activeTabId: "tab-close",
        tabs: [
          {
            ...group.tabs[0],
            id: "tab-close",
            filePath,
            content,
            isDirty: true,
            saveStatus: "dirty",
            temporaryTitle: "关闭测试",
          },
        ],
      },
    ],
  });
}

describe("closeEditorTab", () => {
  const saveAs = vi.fn();
  const writeFile = vi.fn();

  beforeEach(() => {
    const state = useEditorStore.getState();
    const group = state.panelGroups[0];
    if (group.tabs.length === 0) state.addTab(group.id);
    saveAs.mockResolvedValue({
      code: CodeResult.Success,
      data: { filePath: "C:/notes/saved-draft.md" },
    });
    writeFile.mockResolvedValue(undefined);
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { ...window.electronAPI, saveAs, writeFile },
    });
  });

  afterEach(() => {
    editorSaveCoordinator.cancel("C:/notes/close.md");
    vi.clearAllMocks();
  });

  it("flushes and saves the latest named document before removing its tab", async () => {
    seedTab("C:/notes/close.md", "stale");
    const unregister = registerEditorChangeFlusher(
      useEditorStore.getState().activeGroupId,
      "tab-close",
      async () => {
        useEditorStore
          .getState()
          .setTabContent(
            useEditorStore.getState().activeGroupId,
            "tab-close",
            "latest",
          );
        editorSaveCoordinator.schedule("C:/notes/close.md", "latest");
      },
    );

    await expect(
      closeEditorTab(useEditorStore.getState().activeGroupId, "tab-close"),
    ).resolves.toBe(true);

    expect(writeFile).toHaveBeenCalledWith("C:/notes/close.md", "latest");
    expect(useEditorStore.getState().panelGroups[0]?.tabs).toHaveLength(0);
    unregister();
  });

  it("keeps an untitled dirty tab when Save As is cancelled", async () => {
    seedTab(null, "# Draft");
    saveAs.mockResolvedValue({ code: -1, data: null });

    await expect(
      closeEditorTab(useEditorStore.getState().activeGroupId, "tab-close"),
    ).resolves.toBe(false);

    expect(saveAs).toHaveBeenCalledWith("# Draft", "关闭测试");
    expect(useEditorStore.getState().panelGroups[0].tabs).toHaveLength(1);
  });

  it("saves an untitled dirty tab before removing it", async () => {
    seedTab(null, "# Draft");

    await expect(
      closeEditorTab(useEditorStore.getState().activeGroupId, "tab-close"),
    ).resolves.toBe(true);

    expect(saveAs).toHaveBeenCalledWith("# Draft", "关闭测试");
    expect(useEditorStore.getState().panelGroups[0]?.tabs).toHaveLength(0);
  });
});
