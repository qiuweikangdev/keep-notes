import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "./editor.store";
import { richPaneViewStateRegistry } from "@/features/editor/lib/rich-pane-view-state";

describe("editor store", () => {
  beforeEach(() => {
    richPaneViewStateRegistry.clear();
    useEditorStore.setState({
      activeGroupId: "group-1",
      content: "legacy draft",
      filePath: "legacy.md",
      wordCount: 12,
      isDirty: true,
      outlineHeadingsByPath: {},
      activeHeadingIdByPane: {},
      fileDragTargetGroupId: null,
      recentOpenedFilePaths: ["note.md", "other.md"],
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

  it("skips persistence writes for unchanged file drag targets", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setItem.mockClear();

    useEditorStore.getState().setFileDragTargetGroupId("group-1");
    const writeCountAfterTargetChange = setItem.mock.calls.length;
    expect(writeCountAfterTargetChange).toBeGreaterThan(0);

    useEditorStore.getState().setFileDragTargetGroupId("group-1");
    useEditorStore.getState().clearFileDragTargetGroupId("group-2");

    expect(setItem).toHaveBeenCalledTimes(writeCountAfterTargetChange);
    expect(useEditorStore.getState().fileDragTargetGroupId).toBe("group-1");
    setItem.mockRestore();
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

  it("keeps a temporary title for an unnamed tab until it is saved", () => {
    const store = useEditorStore.getState();

    store.setTabTemporaryTitle("group-1", "tab-1", "临时草稿");
    expect(
      useEditorStore.getState().panelGroups[0].tabs[0].temporaryTitle,
    ).toBe("临时草稿");

    store.setTabFilePath("group-1", "tab-1", "C:/notes/draft.md");
    expect(
      useEditorStore.getState().panelGroups[0].tabs[0].temporaryTitle,
    ).toBeNull();
  });

  it("updates every open tab and recent path after a file is renamed", () => {
    const initialGroup = useEditorStore.getState().panelGroups[0];
    const firstGroup = {
      ...initialGroup,
      tabs: initialGroup.tabs.map((tab) => ({
        ...tab,
        filePath: "C:/notes/note.md",
      })),
    };
    useEditorStore.setState({
      filePath: "C:\\notes\\note.md",
      recentOpenedFilePaths: ["C:\\notes\\note.md", "other.md"],
      panelGroups: [
        firstGroup,
        {
          ...firstGroup,
          id: "group-2",
          activeTabId: "tab-2",
          tabs: [
            {
              ...firstGroup.tabs[0],
              id: "tab-2",
            },
          ],
        },
      ],
    });

    useEditorStore
      .getState()
      .renameFilePath("C:\\notes\\note.md", "C:\\notes\\renamed.md");

    const state = useEditorStore.getState();
    expect(state.filePath).toBe("C:\\notes\\renamed.md");
    expect(state.recentOpenedFilePaths).toEqual([
      "C:\\notes\\renamed.md",
      "other.md",
    ]);
    expect(
      state.panelGroups.flatMap((group) =>
        group.tabs.map((tab) => tab.filePath),
      ),
    ).toEqual(["C:\\notes\\renamed.md", "C:\\notes\\renamed.md"]);
  });

  it("creates unnamed tabs in an immediately editable rich mode", () => {
    const tabId = useEditorStore.getState().addTab("group-1");
    const tab = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((item) => item.id === tabId);

    expect(tab).toMatchObject({
      filePath: null,
      content: "",
      mode: "rich",
      loadStatus: "ready",
    });
  });

  it("opens a quick-editor draft in a new unnamed tab without replacing a file", () => {
    const tabId = useEditorStore
      .getState()
      .openQuickEditorDraft("# Quick draft\n");

    const state = useEditorStore.getState();
    const group = state.panelGroups[0];
    const importedTab = group.tabs.find((tab) => tab.id === tabId);

    expect(group.tabs).toHaveLength(2);
    expect(group.activeTabId).toBe(tabId);
    expect(importedTab).toMatchObject({
      filePath: null,
      content: "# Quick draft\n",
      isDirty: true,
      mode: "rich",
      loadStatus: "ready",
      saveStatus: "dirty",
    });
  });

  it("reuses the current clean unnamed tab for a quick-editor draft", () => {
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => ({
          ...tab,
          filePath: null,
          content: "",
          isDirty: false,
        })),
      })),
    }));

    const tabId = useEditorStore
      .getState()
      .openQuickEditorDraft("![clip](data:image/png;base64,AQID)");
    const group = useEditorStore.getState().panelGroups[0];

    expect(group.tabs).toHaveLength(1);
    expect(tabId).toBe("tab-1");
    expect(group.tabs[0]).toMatchObject({
      content: "![clip](data:image/png;base64,AQID)",
      isDirty: true,
      reloadKey: 1,
    });
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

  it("keeps document headings shared by path and active headings isolated by pane", () => {
    const store = useEditorStore.getState();
    const headings = [{ id: "heading-1", text: "Intro", level: 1 }];

    store.setOutlineHeadingsForPath("C:\\notes\\shared.md", headings);
    store.setActiveHeadingIdForPane("group-1:tab-1", "heading-1");
    store.setActiveHeadingIdForPane("group-2:tab-2", "heading-2");

    const state = useEditorStore.getState();
    expect(state.outlineHeadingsByPath["C:/notes/shared.md"]).toEqual(headings);
    expect(state.activeHeadingIdByPane).toMatchObject({
      "group-1:tab-1": "heading-1",
      "group-2:tab-2": "heading-2",
    });
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

  it("clones the source pane view and outline state when splitting", () => {
    richPaneViewStateRegistry.patch("group-1:tab-1", { scrollTop: 360 });
    useEditorStore
      .getState()
      .setActiveHeadingIdForPane("group-1:tab-1", "heading-2");

    useEditorStore.getState().addPanelGroup("horizontal", "group-1");

    const newGroup = useEditorStore.getState().panelGroups.at(-1)!;
    const newPaneKey = `${newGroup.id}:${newGroup.activeTabId}` as const;
    expect(richPaneViewStateRegistry.read(newPaneKey).scrollTop).toBe(360);
    expect(useEditorStore.getState().activeHeadingIdByPane[newPaneKey]).toBe(
      "heading-2",
    );
  });

  it("does not notify when a path snapshot is already current", () => {
    const before = useEditorStore.getState();

    useEditorStore
      .getState()
      .syncFileContent(
        "note.md",
        before.panelGroups[0].tabs[0].content,
        undefined,
        [before.panelGroups[0].tabs[0].id],
      );

    expect(useEditorStore.getState()).toBe(before);
  });

  it("updates parse state for every canonical-path tab without changing unrelated identities", () => {
    const firstGroup = useEditorStore.getState().panelGroups[0];
    const unrelatedGroup = {
      ...firstGroup,
      id: "group-2",
      activeTabId: "tab-2",
      tabs: [
        {
          ...firstGroup.tabs[0],
          id: "tab-2",
          filePath: "other.md",
        },
      ],
    };
    useEditorStore.setState({
      panelGroups: [
        {
          ...firstGroup,
          tabs: [{ ...firstGroup.tabs[0], filePath: "C:\\notes\\note.md" }],
        },
        unrelatedGroup,
      ],
    });
    const before = useEditorStore.getState();

    before.setFileParseState("C:/notes/note.md", "parse failed");

    const after = useEditorStore.getState();
    expect(after.panelGroups[0].tabs[0]).toMatchObject({
      mode: "source",
      parseErrorMessage: "parse failed",
    });
    expect(after.panelGroups[1]).toBe(unrelatedGroup);

    const current = useEditorStore.getState();
    current.setFileParseState("C:/notes/note.md", "parse failed");
    expect(useEditorStore.getState()).toBe(current);
  });

  it("allows three direct visible splits without hidden groups", () => {
    useEditorStore.getState().addPanelGroup("horizontal", "group-1");
    const second = useEditorStore.getState().panelGroups[1];

    useEditorStore.getState().addPanelGroup("vertical", second.id);

    const panelGroups = useEditorStore.getState().panelGroups;
    const groupKeys = new Set([
      "id",
      "tabs",
      "activeTabId",
      "direction",
      "splitParentGroupId",
    ]);
    expect(panelGroups).toHaveLength(3);
    expect(
      panelGroups.every((group) =>
        Object.keys(group).every((key) => groupKeys.has(key)),
      ),
    ).toBe(true);
  });

  it("does not expose peer synchronization lifecycle actions", () => {
    const actionNames = Object.entries(useEditorStore.getState())
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name);

    expect(
      actionNames.filter((name) =>
        /warmup|standby|mirror|synchronization/i.test(name),
      ),
    ).toEqual([]);
  });

  it("updates a synchronized rich-text tab without forcing a document reload", () => {
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
      .syncFileContent("note.md", "mirrored", "tab-1", ["tab-2"]);

    const synchronizedTab = useEditorStore.getState().panelGroups[1].tabs[0];
    expect(synchronizedTab.content).toBe("mirrored");
    expect(synchronizedTab.reloadKey).toBe(0);
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
});
