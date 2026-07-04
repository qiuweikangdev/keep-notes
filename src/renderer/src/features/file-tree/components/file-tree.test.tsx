import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTree } from "./file-tree";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";

const electronMocks = vi.hoisted(() => ({
  openFolder: vi.fn(),
  openFile: vi.fn(),
  createFile: vi.fn(),
  createFolder: vi.fn(),
  deleteItem: vi.fn(),
  moveItem: vi.fn(),
  renameItem: vi.fn(),
  openInExplorer: vi.fn(),
  copyPath: vi.fn(),
  openInNewWindow: vi.fn(),
  getFileHeadContent: vi.fn(),
}));

const diffStoreMock = vi.hoisted(() => ({
  openDiff: vi.fn(),
  closeDiff: vi.fn(),
  updateContent: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getTotalSize: () => options.count * 28,
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        key: index,
        size: 28,
        start: index * 28,
      })),
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => electronMocks,
}));

vi.mock("@/store/diff.store", () => ({
  useDiffStore: () => diffStoreMock,
}));

describe("FileTree context menu", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matches: false,
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
        readFile: vi.fn().mockResolvedValue("worktree content"),
      },
    });
    electronMocks.getFileHeadContent.mockResolvedValue({
      code: CodeResult.Success,
      data: "head content",
    });
    useEditorStore.setState({
      panelGroups: [],
      appearance: {
        ...useEditorStore.getState().appearance,
        sidebarView: "file",
      },
    });
    useTreeStore.setState({
      treeData: [{ title: "daily.md", key: "/notes/daily.md" }],
      treeRoot: { title: "notes", key: "/notes" },
      selectedKey: null,
      expandedKeys: new Set(["/notes"]),
    });
  });

  it("shows an export action from the virtualized file node menu", async () => {
    render(<FileTree />);

    fireEvent.contextMenu(await screen.findByText("daily.md"));

    expect(
      await screen.findByRole("menuitem", { name: /导出/ }),
    ).toBeInTheDocument();
  });

  it("opens the diff dialog from the virtualized file node menu", async () => {
    render(<FileTree />);

    fireEvent.contextMenu(await screen.findByText("daily.md"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /比较差异/ }));

    await waitFor(() => {
      expect(diffStoreMock.openDiff).toHaveBeenCalledWith(
        "/notes/daily.md",
        "",
        "",
      );
    });
    await waitFor(() => {
      expect(diffStoreMock.updateContent).toHaveBeenCalledWith(
        "head content",
        "worktree content",
      );
    });
  });
});
