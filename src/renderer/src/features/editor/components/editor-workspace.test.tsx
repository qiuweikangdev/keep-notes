import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import {
  backgroundEditorSaveCoordinator,
  richDocumentSessionManager,
  subscribeToEditorFile,
} from "../lib/editor-runtime";
import { editorFindController } from "../lib/editor-find-controller";
import { EditorWorkspace } from "./editor-workspace";

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    openFile: vi.fn(),
  }),
}));

vi.mock("../lib/editor-runtime", () => ({
  backgroundEditorSaveCoordinator: {
    cancel: vi.fn(),
  },
  editorCache: {
    setContent: vi.fn(),
  },
  editorSaveCoordinator: {
    schedule: vi.fn(),
  },
  richDocumentSessionManager: {
    discardPendingChange: vi.fn(),
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
  vi.clearAllMocks();
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

  it("preserves the source editor scroll position after an external file update", () => {
    let emitExternalChange: ((content: string) => void) | null = null;
    vi.mocked(subscribeToEditorFile).mockImplementationOnce(
      (_path, listener) => {
        emitExternalChange = listener;
        return vi.fn();
      },
    );
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.id === "tab-1"
                  ? {
                      ...tab,
                      mode: "source" as const,
                      isDirty: true,
                      saveStatus: "error" as const,
                      errorMessage: "save failed",
                      parseErrorMessage: "parse failed",
                    }
                  : tab,
              ),
            }
          : group,
      ),
    }));
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);
    const editor = screen.getByRole("textbox");
    editor.scrollTop = 480;
    fireEvent.scroll(editor);

    act(() => {
      emitExternalChange?.("# Updated outside\n\nNew content\n");
    });

    expect(editor).toHaveValue("# Updated outside\n\nNew content\n");
    expect(editor.scrollTop).toBe(480);
    const tab = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((candidate) => candidate.id === "tab-1");
    expect(tab).toMatchObject({
      scrollTop: 480,
      isDirty: false,
      saveStatus: "clean",
      errorMessage: null,
      parseErrorMessage: null,
      loadStatus: "ready",
    });
  });

  it("cleans source state without reloading rich tabs after prioritized synchronization", () => {
    let emitExternalChange: ((content: string) => void) | null = null;
    vi.mocked(subscribeToEditorFile).mockImplementationOnce(
      (_path, listener) => {
        emitExternalChange = listener;
        return vi.fn();
      },
    );
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.id === "tab-1"
                  ? {
                      ...tab,
                      mode: "source" as const,
                      isDirty: true,
                      saveStatus: "error" as const,
                      errorMessage: "save failed",
                      parseErrorMessage: "parse failed",
                    }
                  : tab,
              ),
            }
          : group,
      ),
    }));
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);
    const editor = screen.getByRole("textbox");
    editor.scrollTop = 480;
    fireEvent.scroll(editor);
    const externalContent = "# Updated by prioritized rich listener\n";

    act(() => {
      useEditorStore.getState().syncFileContent("large.md", externalContent);
    });
    const richReloadKeyBeforeSourceListener = useEditorStore
      .getState()
      .panelGroups[1].tabs.find(
        (candidate) => candidate.id === "tab-2",
      )?.reloadKey;
    act(() => {
      emitExternalChange?.(externalContent);
    });

    const state = useEditorStore.getState();
    const sourceTab = state.panelGroups[0].tabs.find(
      (candidate) => candidate.id === "tab-1",
    );
    const richTab = state.panelGroups[1].tabs.find(
      (candidate) => candidate.id === "tab-2",
    );
    expect(sourceTab).toMatchObject({
      scrollTop: 480,
      isDirty: false,
      saveStatus: "clean",
      errorMessage: null,
      parseErrorMessage: null,
      loadStatus: "ready",
    });
    expect(richTab?.reloadKey).toBe(richReloadKeyBeforeSourceListener);
  });

  it("ignores an old-path external update while a new source file is loading", () => {
    let emitExternalChange: ((content: string) => void) | null = null;
    vi.mocked(subscribeToEditorFile).mockImplementationOnce(
      (_path, listener) => {
        emitExternalChange = listener;
        return vi.fn();
      },
    );
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.id === "tab-1" ? { ...tab, mode: "source" as const } : tab,
              ),
            }
          : group,
      ),
    }));
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    act(() => {
      useEditorStore.getState().beginTabLoad("group-1", "tab-1", "next.md");
      emitExternalChange?.("# Old file changed during switch\n");
    });

    let tab = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((candidate) => candidate.id === "tab-1");
    expect(tab).toMatchObject({
      filePath: "large.md",
      pendingFilePath: "next.md",
      loadStatus: "loading",
    });

    act(() => {
      useEditorStore
        .getState()
        .completeTabLoad("group-1", "tab-1", "next.md", "# Next file\n");
    });
    tab = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((candidate) => candidate.id === "tab-1");
    expect(tab).toMatchObject({
      filePath: "next.md",
      pendingFilePath: null,
      content: "# Next file\n",
      loadStatus: "ready",
    });
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

  it("mounts an editable rich pane for an unnamed tab", () => {
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-untitled",
          direction: "horizontal",
          tabs: [createTab("tab-untitled", null, "")],
        },
      ],
    });

    render(<EditorWorkspace groupId="group-1" tabId="tab-untitled" />);

    expect(screen.getByTestId("rich-document-pane")).toHaveTextContent(
      "group-1:tab-untitled:keep-notes-untitled://tab-untitled",
    );
  });

  it("binds a new rich tab to the dragged file while its content is loading", () => {
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-dropped",
          direction: "horizontal",
          tabs: [
            {
              ...createTab("tab-dropped", null, ""),
              pendingFilePath: "/notes/dragged.md",
              loadStatus: "loading",
            },
          ],
        },
      ],
    });

    render(<EditorWorkspace groupId="group-1" tabId="tab-dropped" />);

    expect(screen.getByTestId("rich-document-pane")).toHaveTextContent(
      "group-1:tab-dropped:/notes/dragged.md",
    );
  });

  it("opens the find widget outside the translucent editor tree", () => {
    const { container } = render(
      <EditorWorkspace groupId="group-1" tabId="tab-1" />,
    );

    act(() => {
      editorFindController.open("group-1", "tab-1");
    });

    const widget = screen.getByRole("search", {
      name: "文件内搜索与替换",
    });
    expect(widget).toBeInTheDocument();
    expect(container).not.toContainElement(widget);
  });

  it("refocuses the find input when search is requested again", async () => {
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    act(() => {
      editorFindController.open("group-1", "tab-1");
    });

    const searchInput = screen.getByPlaceholderText("查找");
    await waitFor(() => expect(searchInput).toHaveFocus());

    const otherButton = document.createElement("button");
    document.body.append(otherButton);
    otherButton.focus();
    expect(otherButton).toHaveFocus();

    act(() => {
      editorFindController.open("group-1", "tab-1");
    });

    await waitFor(() => expect(searchInput).toHaveFocus());
    otherButton.remove();
  });

  it("keeps the current rich pane mounted while the next file is loading", () => {
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.id === "tab-1"
                  ? {
                      ...tab,
                      pendingFilePath: "next.md",
                      loadStatus: "loading" as const,
                    }
                  : tab,
              ),
            }
          : group,
      ),
    }));

    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    expect(screen.getByTestId("rich-document-pane")).toHaveTextContent(
      "group-1:tab-1:large.md",
    );
    expect(screen.queryByTestId("editor-loading-skeleton")).toBeNull();
  });

  it("cancels a pending rich-text save before source editing takes ownership", () => {
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.id === "tab-1" ? { ...tab, mode: "source" as const } : tab,
              ),
            }
          : group,
      ),
    }));
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "# Source edit\n" },
    });

    expect(backgroundEditorSaveCoordinator.cancel).toHaveBeenCalledWith(
      "large.md",
    );
    expect(
      richDocumentSessionManager.discardPendingChange,
    ).toHaveBeenCalledWith("large.md");
  });

  it("cancels pending rich work before source-mode replace all", async () => {
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.id === "tab-1" ? { ...tab, mode: "source" as const } : tab,
              ),
            }
          : group,
      ),
    }));
    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);
    act(() => editorFindController.open("group-1", "tab-1"));

    fireEvent.change(screen.getByPlaceholderText("查找"), {
      target: { value: "Large" },
    });
    fireEvent.click(screen.getByRole("button", { name: "展开替换" }));
    fireEvent.change(screen.getByPlaceholderText("替换"), {
      target: { value: "Updated" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "替换全部匹配" }),
    );

    expect(backgroundEditorSaveCoordinator.cancel).toHaveBeenCalledWith(
      "large.md",
    );
    expect(
      richDocumentSessionManager.discardPendingChange,
    ).toHaveBeenCalledWith("large.md");
  });

  it("cancels pending rich work before repairing source content", async () => {
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.id === "tab-1"
                  ? {
                      ...tab,
                      content: "* item\n  * nested\n    *\n",
                      mode: "source" as const,
                    }
                  : tab,
              ),
            }
          : group,
      ),
    }));

    render(<EditorWorkspace groupId="group-1" tabId="tab-1" />);

    await waitFor(() => {
      expect(backgroundEditorSaveCoordinator.cancel).toHaveBeenCalledWith(
        "large.md",
      );
      expect(
        richDocumentSessionManager.discardPendingChange,
      ).toHaveBeenCalledWith("large.md");
    });
  });
});

function createLargeContent() {
  return `# Large\n${"content line\n".repeat(900)}`;
}

function createTab(id: string, filePath: string | null, content: string) {
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
