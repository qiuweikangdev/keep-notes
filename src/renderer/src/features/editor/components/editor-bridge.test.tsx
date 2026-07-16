import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editor.store";
import { EditorBridge } from "./editor-bridge";

const updateDirtyState = vi.fn();

function seedBackgroundDraft(): void {
  const baseGroup = useEditorStore.getState().panelGroups[0];
  const cleanTab = {
    ...baseGroup.tabs[0],
    id: "tab-clean",
    filePath: "/notes/clean.md",
    content: "clean",
  };
  const draftTab = {
    ...baseGroup.tabs[0],
    id: "tab-draft",
    filePath: null,
    content: "draft",
    isDirty: true,
    saveStatus: "dirty" as const,
  };

  useEditorStore.setState({
    activeGroupId: "group-1",
    panelGroups: [
      {
        ...baseGroup,
        id: "group-1",
        activeTabId: cleanTab.id,
        tabs: [cleanTab, draftTab],
      },
    ],
  });
}

describe("EditorBridge close protection", () => {
  beforeEach(() => {
    updateDirtyState.mockReset();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { updateDirtyState },
    });
    seedBackgroundDraft();
  });

  afterEach(() => {
    cleanup();
  });

  it("reports a background draft and selects it for close saving", () => {
    render(<EditorBridge />);

    expect(updateDirtyState).toHaveBeenLastCalledWith(true);
    expect((window as any).__getNextDirtyEditor()).toEqual({
      groupId: "group-1",
      tabId: "tab-draft",
      content: "draft",
      filePath: null,
    });
    expect(useEditorStore.getState().panelGroups[0].activeTabId).toBe(
      "tab-draft",
    );
  });

  it("marks the exact saved draft clean and assigns its Save As path", () => {
    render(<EditorBridge />);

    act(() => {
      (window as any).__onCloseSaveSuccess(
        "group-1",
        "tab-draft",
        "/notes/draft.md",
        "draft",
      );
    });

    const draft = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((tab) => tab.id === "tab-draft");
    expect(draft).toMatchObject({
      filePath: "/notes/draft.md",
      isDirty: false,
    });
    expect(updateDirtyState).toHaveBeenLastCalledWith(false);
  });

  it("keeps a draft dirty when its content changes while the snapshot is saving", () => {
    render(<EditorBridge />);

    expect((window as any).__getNextDirtyEditor()).toMatchObject({
      content: "draft",
      filePath: null,
    });

    act(() => {
      useEditorStore
        .getState()
        .setTabContent("group-1", "tab-draft", 'new "draft"\nline');
      (window as any).__onCloseSaveSuccess(
        "group-1",
        "tab-draft",
        "/notes/draft.md",
        "draft",
      );
    });

    const draft = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((tab) => tab.id === "tab-draft");
    expect(draft).toMatchObject({
      filePath: "/notes/draft.md",
      content: 'new "draft"\nline',
      isDirty: true,
    });
    expect((window as any).__getNextDirtyEditor()).toEqual({
      groupId: "group-1",
      tabId: "tab-draft",
      content: 'new "draft"\nline',
      filePath: "/notes/draft.md",
    });
    expect(updateDirtyState).toHaveBeenLastCalledWith(true);
  });
});
