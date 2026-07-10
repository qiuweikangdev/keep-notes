import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import { EditorWorkspace } from "./editor-workspace";

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    openFile: vi.fn(),
  }),
}));

vi.mock("../lib/editor-runtime", () => ({
  editorCache: {
    setContent: vi.fn(),
  },
  editorSaveCoordinator: {
    schedule: vi.fn(),
  },
  subscribeToEditorFile: vi.fn(() => () => {}),
}));

vi.mock("./blocknote-editor", () => ({
  BlockNoteEditor: ({ groupId, tabId }: { groupId: string; tabId: string }) => (
    <div data-testid="blocknote-editor">{`${groupId}:${tabId}`}</div>
  ),
}));

beforeEach(() => {
  useEditorStore.setState({
    activeGroupId: "group-1",
    panelGroups: [
      {
        id: "group-1",
        activeTabId: "tab-1",
        direction: "horizontal",
        tabs: [createTab("tab-1", "large.md", "# Large\n")],
      },
      {
        id: "group-2",
        activeTabId: "tab-2",
        direction: "horizontal",
        splitParentGroupId: "group-1",
        tabs: [createTab("tab-2", "large.md", createLargeContent())],
      },
    ],
  });
});

afterEach(() => {
  cleanup();
});

describe("EditorWorkspace split rich editor mount", () => {
  it("mounts a large split rich editor without a raw Markdown transition", () => {
    render(<EditorWorkspace groupId="group-2" tabId="tab-2" />);

    expect(screen.queryByTestId("split-rich-editor-snapshot")).toBeNull();
    expect(screen.getByTestId("blocknote-editor")).toHaveTextContent(
      "group-2:tab-2",
    );
  });

  it("mounts normal rich editor panes immediately", () => {
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    expect(screen.queryByTestId("split-rich-editor-snapshot")).toBeNull();
    expect(screen.getByTestId("blocknote-editor")).toHaveTextContent(
      "group-1:tab-1",
    );
  });
});

function createLargeContent() {
  return `# Large\n${"content line\n".repeat(900)}`;
}

function createTab(id: string, filePath: string, content: string) {
  return {
    id,
    filePath,
    pendingFilePath: null,
    content,
    wordCount: content.length,
    isDirty: false,
    reloadKey: 0,
    mode: "rich" as const,
    loadStatus: "ready" as const,
    saveStatus: "clean" as const,
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
  };
}
