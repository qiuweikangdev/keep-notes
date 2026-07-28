import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTreeStore } from "@/store/tree.store";
import { QuickActionsPanel } from "./quick-actions-panel";

const electronMocks = vi.hoisted(() => ({
  openFolder: vi.fn(),
  loadTree: vi.fn(),
  openInExplorer: vi.fn(),
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => electronMocks,
}));

describe("QuickActionsPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
      },
    });
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "/notes" },
      recentFolders: [{ title: "my-notes3", path: "/my-notes3" }],
    });
  });

  it("uses the file tree hover color for menu rows", () => {
    render(<QuickActionsPanel />);
    fireEvent.click(screen.getByText("notes"));

    const menuItem = screen.getByRole("button", {
      name: "在 Finder 中显示",
    });
    expect(menuItem).toHaveAttribute("data-selection-surface", "true");
    expect(menuItem).toHaveAttribute("data-selection-context", "secondary");

    const recentFolderRow = screen.getByText("my-notes3").parentElement;
    expect(recentFolderRow).not.toBeNull();
    fireEvent.mouseEnter(recentFolderRow!);
    expect(recentFolderRow).toHaveStyle({
      backgroundColor: "var(--file-tree-row-hover)",
    });
  });
});
