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

  it("reloads rich editor content when returning from source mode", () => {
    const store = useEditorStore.getState();

    store.setTabMode("group-1", "tab-1", "source");
    store.setTabContent("group-1", "tab-1", "- item\n");
    store.setTabMode("group-1", "tab-1", "rich");

    const tab = useEditorStore.getState().panelGroups[0].tabs[0];
    expect(tab.mode).toBe("rich");
    expect(tab.reloadKey).toBe(1);
  });

  it("records which panel group is split when adding a target panel", () => {
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: [
        useEditorStore.getState().panelGroups[0],
        {
          ...useEditorStore.getState().panelGroups[0],
          id: "group-2",
          activeTabId: "tab-2",
          direction: "vertical",
          tabs: [
            {
              ...useEditorStore.getState().panelGroups[0].tabs[0],
              id: "tab-2",
            },
          ],
        },
      ],
    });

    useEditorStore.getState().addPanelGroup("horizontal", "group-1");

    const addedGroup = useEditorStore.getState().panelGroups.at(-1);
    expect(addedGroup?.direction).toBe("horizontal");
    expect(addedGroup?.splitParentGroupId).toBe("group-1");
    expect(useEditorStore.getState().activeGroupId).toBe("group-1");
  });

  it("claims a ready split warmup without changing its group or tab identity", () => {
    const warmupGroupId = useEditorStore
      .getState()
      .prepareSplitWarmup("group-1");
    expect(warmupGroupId).toBeTruthy();

    const preparedGroup = useEditorStore
      .getState()
      .panelGroups.find((group) => group.id === warmupGroupId);
    const preparedTabId = preparedGroup?.activeTabId;
    useEditorStore.getState().markSplitWarmupReady(warmupGroupId!);

    useEditorStore.getState().addPanelGroup("vertical", "group-1");

    const claimedGroup = useEditorStore
      .getState()
      .panelGroups.find((group) => group.id === warmupGroupId);
    expect(claimedGroup).toMatchObject({
      id: warmupGroupId,
      activeTabId: preparedTabId,
      direction: "vertical",
      splitParentGroupId: "group-1",
    });
    expect(claimedGroup?.splitWarmup).toBeUndefined();
    expect(useEditorStore.getState().activeGroupId).toBe("group-1");
  });

  it("does not leave a hidden warmup as the last visible panel", () => {
    const warmupGroupId = useEditorStore
      .getState()
      .prepareSplitWarmup("group-1");
    expect(warmupGroupId).toBeTruthy();

    useEditorStore.getState().removePanelGroup("group-1");

    const state = useEditorStore.getState();
    expect(state.panelGroups).toHaveLength(1);
    expect(state.panelGroups[0].splitWarmup).toBeUndefined();
    expect(state.activeGroupId).toBe(state.panelGroups[0].id);
  });

  it("updates mirrored rich-text tab source without forcing a document reload", () => {
    const sourceGroup = useEditorStore.getState().panelGroups[0];
    useEditorStore.setState({
      panelGroups: [
        sourceGroup,
        {
          ...sourceGroup,
          id: "group-2",
          activeTabId: "tab-2",
          tabs: [{ ...sourceGroup.tabs[0], id: "tab-2" }],
          splitWarmup: {
            sourceGroupId: "group-1",
            sourceTabId: "tab-1",
            status: "ready",
          },
        },
      ],
    });

    useEditorStore
      .getState()
      .syncFileContent("note.md", "mirrored", "tab-1", ["tab-2"]);

    const peerTab = useEditorStore.getState().panelGroups[1].tabs[0];
    expect(peerTab.content).toBe("mirrored");
    expect(peerTab.reloadKey).toBe(0);
  });

  it("still reloads an independent same-file tab outside the synchronization group", () => {
    const sourceGroup = useEditorStore.getState().panelGroups[0];
    useEditorStore.setState({
      panelGroups: [
        sourceGroup,
        {
          ...sourceGroup,
          id: "group-2",
          activeTabId: "tab-2",
          tabs: [{ ...sourceGroup.tabs[0], id: "tab-2" }],
        },
      ],
    });

    useEditorStore
      .getState()
      .syncFileContent("note.md", "external", "tab-1", []);

    expect(useEditorStore.getState().panelGroups[1].tabs[0].reloadKey).toBe(1);
  });

  it("ignores and discards a warmup when closing the last visible tab", () => {
    useEditorStore.getState().prepareSplitWarmup("group-1");

    useEditorStore.getState().removeTab("group-1", "tab-1");

    const state = useEditorStore.getState();
    expect(state.panelGroups).toHaveLength(1);
    expect(state.panelGroups[0].id).toBe("group-1");
    expect(state.panelGroups[0].tabs).toEqual([]);
    expect(state.panelGroups[0].splitWarmup).toBeUndefined();
  });
});
