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

  it("keeps outline heading state stable when extracted headings are unchanged", () => {
    const headings = [
      { id: "heading-1", text: "Intro", level: 1 },
      { id: "heading-2", text: "Details", level: 2 },
    ];

    useEditorStore.getState().setOutlineHeadings(headings);
    const previousState = useEditorStore.getState();

    useEditorStore.getState().setOutlineHeadings([...headings]);

    expect(useEditorStore.getState()).toBe(previousState);
  });

  it("clears outline state when opening another file", () => {
    useEditorStore.setState({
      outlineHeadings: [
        { id: "heading-1", text: "Intro", level: 1 },
        { id: "heading-2", text: "Details", level: 2 },
      ],
      activeHeadingId: "heading-2",
    });

    useEditorStore.getState().beginTabLoad("group-1", "tab-1", "next.md");

    const state = useEditorStore.getState();
    expect(state.outlineHeadings).toEqual([]);
    expect(state.activeHeadingId).toBeNull();
  });

  it("resets tab scroll offset as soon as another file starts opening", () => {
    useEditorStore.getState().setTabScrollTop("group-1", "tab-1", 480);

    useEditorStore.getState().beginTabLoad("group-1", "tab-1", "next.md");

    const tab = useEditorStore.getState().panelGroups[0].tabs[0];
    expect(tab.scrollTop).toBe(0);
  });
});
