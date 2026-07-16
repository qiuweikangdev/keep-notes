import { describe, expect, it, vi } from "vitest";
import type { EditorPanelGroup, EditorTab } from "@/store/editor.store";
import {
  isReusableUntitledTab,
  selectFileOpenTabId,
} from "./editor-tab-opening";

function createTab(patch: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "tab-1",
    filePath: null,
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
    ...patch,
  };
}

function createGroup(tab: EditorTab): EditorPanelGroup {
  return {
    id: "group-1",
    tabs: [tab],
    activeTabId: tab.id,
    direction: "horizontal",
  };
}

describe("editor tab opening", () => {
  it("reuses only a blank clean untitled tab", () => {
    expect(isReusableUntitledTab(createTab())).toBe(true);
    expect(isReusableUntitledTab(createTab({ content: "draft" }))).toBe(false);
    expect(isReusableUntitledTab(createTab({ isDirty: true }))).toBe(false);
    expect(
      isReusableUntitledTab(createTab({ pendingFilePath: "/notes/a.md" })),
    ).toBe(false);
    expect(isReusableUntitledTab(createTab({ filePath: "/notes/a.md" }))).toBe(
      false,
    );
  });

  it("creates a new file target for an edited untitled draft", () => {
    const addTab = vi.fn(() => "tab-2");
    const group = createGroup(
      createTab({ content: "draft", isDirty: true, saveStatus: "dirty" }),
    );

    expect(selectFileOpenTabId(group, addTab)).toBe("tab-2");
    expect(addTab).toHaveBeenCalledWith("group-1");
  });

  it("keeps the existing target for blank untitled and named tabs", () => {
    const addTab = vi.fn(() => "tab-2");

    expect(selectFileOpenTabId(createGroup(createTab()), addTab)).toBe("tab-1");
    expect(
      selectFileOpenTabId(
        createGroup(createTab({ filePath: "/notes/a.md", content: "saved" })),
        addTab,
      ),
    ).toBe("tab-1");
    expect(addTab).not.toHaveBeenCalled();
  });
});
