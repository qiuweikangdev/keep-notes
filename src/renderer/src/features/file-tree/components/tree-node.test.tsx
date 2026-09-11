import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => {
    cleanup();
  });

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

  it("treats uppercase Markdown extensions as editable files", async () => {
    render(
      <TreeNode
        node={{ title: "README.MD", key: "/notes/README.MD" }}
        level={0}
      />,
    );

    fireEvent.contextMenu(screen.getByText("README.MD"));

    expect(
      await screen.findByRole("menuitem", { name: /^打开$/ }),
    ).toBeInTheDocument();
  });

  it("shows an action for opening Markdown files in a new tab", async () => {
    render(
      <TreeNode
        node={{ title: "daily.md", key: "/notes/daily.md" }}
        level={0}
      />,
    );

    fireEvent.contextMenu(screen.getByText("daily.md"));

    expect(
      await screen.findByRole("menuitem", { name: /在新标签页中打开/ }),
    ).toBeInTheDocument();
  });
});
