import { describe, expect, it } from "vitest";

import type { EditorState } from "@/store/editor.store";
import {
  selectEditorLayoutSignature,
  selectPanelGroupSignature,
  selectTabBarSignature,
} from "./editor-view-selectors";

describe("editor view selectors", () => {
  it("ignores content-only updates in structural signatures", () => {
    const initial = createState("first");
    const edited = createState("second");

    expect(selectEditorLayoutSignature(edited)).toBe(
      selectEditorLayoutSignature(initial),
    );
    expect(selectPanelGroupSignature("group-1")(edited)).toBe(
      selectPanelGroupSignature("group-1")(initial),
    );
    expect(selectTabBarSignature("group-1")(edited)).toBe(
      selectTabBarSignature("group-1")(initial),
    );
  });

  it("tracks active tab and dirty-state changes", () => {
    const initial = createState("content");
    const updated = createState("content");
    updated.panelGroups[0].activeTabId = "tab-2";
    updated.panelGroups[0].tabs[0].isDirty = true;
    updated.panelGroups[0].tabs[0].saveStatus = "dirty";

    expect(selectPanelGroupSignature("group-1")(updated)).not.toBe(
      selectPanelGroupSignature("group-1")(initial),
    );
    expect(selectTabBarSignature("group-1")(updated)).not.toBe(
      selectTabBarSignature("group-1")(initial),
    );
  });
});

function createState(content: string): EditorState {
  return {
    panelGroups: [
      {
        id: "group-1",
        activeTabId: "tab-1",
        direction: "horizontal",
        tabs: [
          {
            id: "tab-1",
            filePath: "a.md",
            pendingFilePath: null,
            content,
            wordCount: content.length,
            isDirty: false,
            reloadKey: 0,
            mode: "rich",
            loadStatus: "ready",
            saveStatus: "clean",
            errorMessage: null,
            parseErrorMessage: null,
            scrollTop: 0,
          },
          {
            id: "tab-2",
            filePath: "b.md",
            pendingFilePath: null,
            content: "",
            wordCount: 0,
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
  } as EditorState;
}
