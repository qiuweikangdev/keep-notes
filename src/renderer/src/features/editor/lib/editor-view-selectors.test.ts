import { describe, expect, it } from "vitest";

import type { EditorState } from "@/store/editor.store";
import {
  selectEditorLayoutSignature,
  selectPanelGroupSignature,
  selectRichDocumentRepresentative,
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

  it("selects one rich representative with a minimal descriptor", () => {
    const state = createState("# Large");
    state.panelGroups[0].tabs[0].filePath = "C:/notes/large.md";
    state.panelGroups[0].tabs[0].reloadKey = 2;
    state.panelGroups[0].tabs[0].wordCount = 99;
    state.panelGroups[0].tabs[0].isDirty = true;
    state.panelGroups[0].tabs[0].saveStatus = "saving";
    state.panelGroups[0].tabs[0].scrollTop = 240;
    expect(
      selectRichDocumentRepresentative("C:/notes/large.md")(state),
    ).toEqual({
      path: "C:/notes/large.md",
      content: "# Large",
      reloadKey: 2,
      loadStatus: "ready",
    });
  });

  it("skips source tabs and preserves descriptor identity for unchanged primitives", () => {
    const initial = createState("# Large");
    initial.panelGroups[0].tabs[0].filePath = "C:/notes/large.md";
    initial.panelGroups[0].tabs[1] = {
      ...initial.panelGroups[0].tabs[0],
      id: "source-tab",
      content: "# Source",
      mode: "source",
      reloadKey: 9,
    };
    const selectRepresentative =
      selectRichDocumentRepresentative("C:/notes/large.md");
    const first = selectRepresentative(initial);
    const updated = createState("# Large");
    updated.panelGroups[0].tabs[0] = {
      ...initial.panelGroups[0].tabs[0],
      wordCount: 400,
      isDirty: true,
      saveStatus: "dirty",
      scrollTop: 720,
    };

    expect(selectRepresentative(updated)).toBe(first);
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
