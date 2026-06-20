import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useEditorStore,
  type EditorPanelGroup,
  type EditorTab,
} from "@/store/editor.store";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

function KeyboardShortcutsHarness() {
  useKeyboardShortcuts();
  return null;
}

function setActiveEditorTab(filePath: string | null, content: string) {
  const state = useEditorStore.getState();
  const group = state.panelGroups[0];
  const tab = group.tabs[0];
  const nextTab: EditorTab = {
    ...tab,
    filePath,
    content,
    isDirty: true,
    saveStatus: "dirty",
  };
  const nextGroup: EditorPanelGroup = {
    ...group,
    tabs: [nextTab],
    activeTabId: nextTab.id,
  };

  useEditorStore.setState({
    panelGroups: [nextGroup],
    activeGroupId: nextGroup.id,
    filePath,
    content,
    isDirty: true,
  });
}

describe("useKeyboardShortcuts save action", () => {
  const saveAs = vi.fn();
  const writeFile = vi.fn();

  beforeEach(() => {
    vi.useRealTimers();
    saveAs.mockResolvedValue({ code: 0, data: { filePath: "/notes/new.md" } });
    writeFile.mockResolvedValue(undefined);

    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
        onMenuAction: () => () => undefined,
        saveAs,
        writeFile,
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("saves an existing active editor file without opening the save dialog", async () => {
    setActiveEditorTab("/notes/existing.md", "# Existing");
    render(<KeyboardShortcutsHarness />);

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith(
        "/notes/existing.md",
        "# Existing",
      );
    });
    expect(saveAs).not.toHaveBeenCalled();
  });

  it("opens the save dialog for an untitled active editor tab", async () => {
    setActiveEditorTab(null, "# Untitled");
    render(<KeyboardShortcutsHarness />);

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() => {
      expect(saveAs).toHaveBeenCalledWith("# Untitled");
    });
    expect(writeFile).not.toHaveBeenCalled();
  });
});
