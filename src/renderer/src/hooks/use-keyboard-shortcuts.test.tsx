import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { editorSaveCoordinator } from "@/features/editor/lib/editor-runtime";
import { CodeResult } from "@/types";
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

function setActiveEditorTab(
  filePath: string | null,
  content: string,
  temporaryTitle?: string | null,
) {
  const state = useEditorStore.getState();
  const group = state.panelGroups[0];
  const tab = group.tabs[0];
  const nextTab: EditorTab = {
    ...tab,
    filePath,
    temporaryTitle,
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
  let menuActionListener: ((action: "closeTab") => void) | null = null;

  beforeEach(() => {
    vi.useRealTimers();
    const state = useEditorStore.getState();
    const group = state.panelGroups[0];
    if (group.tabs.length === 0) state.addTab(group.id);
    saveAs.mockResolvedValue({
      code: CodeResult.Success,
      data: { filePath: "/notes/new.md" },
    });
    writeFile.mockResolvedValue(undefined);
    menuActionListener = null;

    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
        onMenuAction: (listener: (action: "closeTab") => void) => {
          menuActionListener = listener;
          return () => undefined;
        },
        saveAs,
        writeFile,
      },
    });
  });

  afterEach(() => {
    editorSaveCoordinator.cancel("/notes/close-shortcut.md");
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

  it("associates an untitled tab with the saved file and saves edits directly afterward", async () => {
    setActiveEditorTab(null, "# Untitled");
    render(<KeyboardShortcutsHarness />);

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() => {
      expect(saveAs).toHaveBeenCalledWith("# Untitled");
      expect(useEditorStore.getState().panelGroups[0].tabs[0]).toMatchObject({
        filePath: "/notes/new.md",
        isDirty: false,
      });
    });

    fireEvent.keyDown(window, { key: "s", metaKey: true });
    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith("/notes/new.md", "# Untitled");
    });
    expect(saveAs).toHaveBeenCalledTimes(1);
  });

  it("uses an untitled tab's temporary title as the save dialog file name", async () => {
    setActiveEditorTab(null, "# Draft", "会议记录");
    render(<KeyboardShortcutsHarness />);

    fireEvent.keyDown(window, { key: "s", metaKey: true });

    await waitFor(() => {
      expect(saveAs).toHaveBeenCalledWith("# Draft", "会议记录");
    });
  });

  it("saves the active tab before Cmd+W removes it", async () => {
    setActiveEditorTab("/notes/close-shortcut.md", "# Latest");
    render(<KeyboardShortcutsHarness />);

    fireEvent.keyDown(window, { key: "w", metaKey: true });

    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith(
        "/notes/close-shortcut.md",
        "# Latest",
      );
      expect(useEditorStore.getState().panelGroups[0].tabs).toHaveLength(0);
    });
  });

  it("routes the application menu close action through the same save path", async () => {
    setActiveEditorTab("/notes/close-shortcut.md", "# Menu latest");
    render(<KeyboardShortcutsHarness />);

    menuActionListener?.("closeTab");

    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith(
        "/notes/close-shortcut.md",
        "# Menu latest",
      );
      expect(useEditorStore.getState().panelGroups[0].tabs).toHaveLength(0);
    });
  });
});
