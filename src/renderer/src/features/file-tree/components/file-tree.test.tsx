import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileTree } from "./file-tree";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";

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
  useElectron: () => ({
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
  }),
}));

describe("FileTree context menu", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matches: false,
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
      },
    });
    useEditorStore.setState({
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
});
