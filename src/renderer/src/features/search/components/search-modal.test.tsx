import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { SearchModal } from "./search-modal";

const openFile = vi.fn();

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    openFile,
  }),
}));

const treeData = [
  {
    title: "docs",
    key: "C:\\notes\\docs",
    children: [
      { title: "first.md", key: "C:\\notes\\docs\\first.md" },
      { title: "second.txt", key: "C:\\notes\\docs\\second.txt" },
      { title: "third.md", key: "C:\\notes\\docs\\third.md" },
      { title: "fourth.md", key: "C:\\notes\\docs\\fourth.md" },
      { title: "fifth.md", key: "C:\\notes\\docs\\fifth.md" },
      { title: "sixth.md", key: "C:\\notes\\docs\\sixth.md" },
      { title: "image.png", key: "C:\\notes\\docs\\image.png" },
    ],
  },
];

function createTab(filePath: string) {
  return {
    id: filePath,
    filePath,
    pendingFilePath: null,
    content: "",
    wordCount: 0,
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

describe("SearchModal", () => {
  beforeEach(() => {
    openFile.mockReset();
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "C:\\notes" },
      treeData,
      selectedKey: null,
    });
    useEditorStore.setState({
      recentEditedFilePaths: [
        "C:\\notes\\docs\\first.md",
        "C:\\notes\\docs\\second.txt",
        "C:\\notes\\docs\\missing.md",
        "C:\\notes\\docs\\image.png",
        "C:\\notes\\docs\\third.md",
        "C:\\notes\\docs\\fourth.md",
        "C:\\notes\\docs\\fifth.md",
        "C:\\notes\\docs\\sixth.md",
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the five most recently edited searchable files by default", () => {
    render(<SearchModal isOpen onClose={vi.fn()} />);

    const options = screen.getAllByRole("option");

    expect(options).toHaveLength(5);
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("first.md"),
      expect.stringContaining("second.txt"),
      expect.stringContaining("third.md"),
      expect.stringContaining("fourth.md"),
      expect.stringContaining("fifth.md"),
    ]);
    expect(screen.queryByText("sixth.md")).not.toBeInTheDocument();
    expect(screen.queryByText("image.png")).not.toBeInTheDocument();
  });

  it("falls back to open files when recent edited history is empty", () => {
    useEditorStore.setState({
      recentEditedFilePaths: [],
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "C:\\notes\\docs\\third.md",
          direction: "horizontal",
          tabs: [
            createTab("C:\\notes\\docs\\third.md"),
            createTab("C:\\notes\\docs\\fourth.md"),
          ],
        },
      ],
    });

    render(<SearchModal isOpen onClose={vi.fn()} />);

    expect(screen.getByText("third.md")).toBeInTheDocument();
    expect(screen.getByText("fourth.md")).toBeInTheDocument();
  });

  it("keeps the search input visually unframed inside the compact modal", () => {
    render(<SearchModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole("searchbox")).toHaveClass(
      "border-0",
      "p-0",
      "shadow-none",
      "focus:ring-0",
    );
  });

  it("uses a text input to avoid the native search clear button", () => {
    render(<SearchModal isOpen onClose={vi.fn()} />);

    const searchInput = screen.getByRole("searchbox");
    expect(searchInput).toHaveAttribute("type", "text");
  });

  it("does not render a fullscreen backdrop overlay", () => {
    render(<SearchModal isOpen onClose={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: "关闭搜索" }),
    ).not.toBeInTheDocument();
  });

  it("moves the active result with arrow keys and opens it with enter", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SearchModal isOpen onClose={onClose} />);

    const searchInput = screen.getByRole("searchbox");
    await user.click(searchInput);
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");

    expect(openFile).toHaveBeenCalledWith("C:\\notes\\docs\\second.txt");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
