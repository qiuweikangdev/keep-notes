import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import { subscribeToEditorFile } from "../lib/editor-runtime";
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

vi.mock("./rich-document-pane", () => ({
  RichDocumentPane: ({
    groupId,
    tabId,
    path,
  }: {
    groupId: string;
    tabId: string;
    path: string;
  }) => (
    <div data-testid="rich-document-pane">{`${groupId}:${tabId}:${path}`}</div>
  ),
}));

vi.mock("./blocknote-editor", () => ({
  BlockNoteEditor: () => null,
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
  it("leaves rich file watching to the document session host", () => {
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    expect(subscribeToEditorFile).not.toHaveBeenCalled();
  });

  it("mounts a large split rich editor without a raw Markdown transition", () => {
    render(<EditorWorkspace groupId="group-2" tabId="tab-2" />);

    expect(screen.queryByTestId("split-rich-editor-snapshot")).toBeNull();
    expect(screen.getByTestId("rich-document-pane")).toHaveTextContent(
      "group-2:tab-2:large.md",
    );
  });

  it("mounts normal rich editor panes immediately", () => {
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    expect(screen.queryByTestId("split-rich-editor-snapshot")).toBeNull();
    expect(screen.getByTestId("rich-document-pane")).toHaveTextContent(
      "group-1:tab-1:large.md",
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
