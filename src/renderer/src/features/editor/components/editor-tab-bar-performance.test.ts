import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import { splitEditorPanel } from "./editor-tab-bar";

const performanceMocks = vi.hoisted(() => ({
  begin: vi.fn(() => 7),
  bindPane: vi.fn(() => true),
  cancel: vi.fn(),
}));

vi.mock("../lib/editor-performance", () => ({
  editorSplitPaintCoordinator: performanceMocks,
}));

describe("editor tab bar split performance span", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEV", true);
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [
            {
              id: "tab-1",
              filePath: "C:/notes/large.md",
              pendingFilePath: null,
              content: "# Large",
              wordCount: 7,
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["horizontal", "vertical"] as const)(
    "begins before the %s split mutation and binds the created pane",
    (direction) => {
      const order: string[] = [];
      performanceMocks.begin.mockImplementationOnce(() => {
        order.push("begin");
        return 7;
      });
      const addPanelGroup = vi.fn(() => {
        order.push("add");
        useEditorStore.getState().addPanelGroup(direction, "group-1");
      });
      performanceMocks.bindPane.mockImplementationOnce(() => {
        order.push("bind");
        return true;
      });

      splitEditorPanel(direction, "group-1", addPanelGroup);

      const createdGroup = useEditorStore.getState().panelGroups[1];
      expect(order).toEqual(["begin", "add", "bind"]);
      expect(performanceMocks.bindPane).toHaveBeenCalledWith(
        7,
        createdGroup.id,
      );
      expect(performanceMocks.cancel).not.toHaveBeenCalled();
    },
  );

  it("cancels the token when no pane is created", () => {
    splitEditorPanel("horizontal", "group-1", vi.fn());

    expect(performanceMocks.cancel).toHaveBeenCalledWith(7);
  });

  it("calls the store directly outside development", () => {
    vi.stubEnv("DEV", false);
    const addPanelGroup = vi.fn();

    splitEditorPanel("horizontal", "group-1", addPanelGroup);

    expect(addPanelGroup).toHaveBeenCalledWith("horizontal", "group-1");
    expect(performanceMocks.begin).not.toHaveBeenCalled();
  });
});
