import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TreeNode } from "./tree-node";
import { useTreeStore } from "@/store/tree.store";

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    openFile: vi.fn(),
    createFile: vi.fn(),
    createFolder: vi.fn(),
    renameItem: vi.fn(),
    deleteItem: vi.fn(),
    moveItem: vi.fn(),
    openInExplorer: vi.fn(),
    copyPath: vi.fn(),
    openInNewWindow: vi.fn(),
    getFileHeadContent: vi.fn(),
  }),
}));

describe("TreeNode context menu", () => {
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
    useTreeStore.setState({
      treeData: [],
      treeRoot: null,
      selectedKey: null,
      expandedKeys: new Set(),
    });
  });

  it("shows an export action for file nodes", async () => {
    render(
      <TreeNode
        node={{ title: "daily.md", key: "/notes/daily.md" }}
        level={0}
      />,
    );

    fireEvent.contextMenu(screen.getByText("daily.md"));

    expect(
      await screen.findByRole("menuitem", { name: /导出/ }),
    ).toBeInTheDocument();
  });
});
