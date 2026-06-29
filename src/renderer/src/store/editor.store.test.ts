import { beforeEach, describe, expect, it } from "vitest";

import { useEditorStore } from "./editor.store";

describe("editor store", () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeGroupId: "group-1",
      content: "legacy draft",
      filePath: "legacy.md",
      wordCount: 12,
      isDirty: true,
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [
            {
              id: "tab-1",
              filePath: "note.md",
              pendingFilePath: null,
              content: "saved",
              wordCount: 5,
              isDirty: false,
              reloadKey: 0,
              mode: "rich",
              loadStatus: "ready",
              saveStatus: "clean",
              errorMessage: null,
              parseErrorMessage: null,
              scrollTop: 0,
            },
          ],
        },
      ],
    });
  });

  it("clears legacy editor state after closing the last tab", () => {
    useEditorStore.getState().removeTab("group-1", "tab-1");

    const state = useEditorStore.getState();

    expect(state.panelGroups[0].tabs).toEqual([]);
    expect(state.panelGroups[0].activeTabId).toBe("");
    expect(state.content).toBe("");
    expect(state.filePath).toBeNull();
    expect(state.wordCount).toBe(0);
    expect(state.isDirty).toBe(false);
  });

  it("marks an unnamed tab clean after its content is cleared", () => {
    const store = useEditorStore.getState();
    store.setTabFilePath("group-1", "tab-1", null);

    store.setTabContent("group-1", "tab-1", "draft");
    store.setTabContent("group-1", "tab-1", "");

    const tab = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((item) => item.id === "tab-1");

    expect(tab?.content).toBe("");
    expect(tab?.isDirty).toBe(false);
    expect(tab?.saveStatus).toBe("clean");
  });
});
