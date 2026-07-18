import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { REVEAL_FILE_TREE_NODE_EVENT } from "@/features/file-tree/utils";
import { SearchModal } from "./search-modal";

const openFile = vi.fn();
const loadTree = vi.fn();

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    loadTree,
    openFile,
  }),
}));

const treeData = [
  { title: "root.md", key: "C:\\notes\\root.md" },
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
      { title: "seventh.md", key: "C:\\notes\\docs\\seventh.md" },
      { title: "eighth.md", key: "C:\\notes\\docs\\eighth.md" },
      { title: "ninth.md", key: "C:\\notes\\docs\\ninth.md" },
      { title: "tenth.md", key: "C:\\notes\\docs\\tenth.md" },
      { title: "eleventh.md", key: "C:\\notes\\docs\\eleventh.md" },
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
    loadTree.mockReset();
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "C:\\notes" },
      treeData,
      selectedKey: null,
      recentFolders: Array.from({ length: 6 }, (_, index) => ({
        title: `folder-${index + 1}`,
        path: `C:\\workspaces\\folder-${index + 1}`,
      })),
    });
    useEditorStore.setState({
      panelGroups: [],
      recentOpenedFilePaths: [
        "C:\\notes\\docs\\first.md",
        "C:\\notes\\docs\\second.txt",
        "C:\\notes\\docs\\missing.md",
        "C:\\notes\\docs\\image.png",
        "C:\\notes\\docs\\third.md",
        "C:\\notes\\docs\\fourth.md",
        "C:\\notes\\docs\\fifth.md",
        "C:\\notes\\docs\\sixth.md",
        "C:\\notes\\docs\\seventh.md",
        "C:\\notes\\docs\\eighth.md",
        "C:\\notes\\docs\\ninth.md",
        "C:\\notes\\docs\\tenth.md",
        "C:\\notes\\docs\\eleventh.md",
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows five recent files followed by five recent folders by default", () => {
    render(<SearchModal isOpen onClose={vi.fn()} />);

    const options = screen.getAllByRole("option");

    expect(screen.getByText("文件")).toBeInTheDocument();
    expect(screen.getByText("目录")).toBeInTheDocument();
    expect(options).toHaveLength(10);
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining("first.md"),
      expect.stringContaining("second.txt"),
      expect.stringContaining("third.md"),
      expect.stringContaining("fourth.md"),
      expect.stringContaining("fifth.md"),
      expect.stringContaining("folder-1"),
      expect.stringContaining("folder-2"),
      expect.stringContaining("folder-3"),
      expect.stringContaining("folder-4"),
      expect.stringContaining("folder-5"),
    ]);
    expect(screen.queryByText("sixth.md")).not.toBeInTheDocument();
    expect(screen.queryByText("folder-6")).not.toBeInTheDocument();
    expect(screen.queryByText("image.png")).not.toBeInTheDocument();
  });

  it("hides the path label for files in the workspace root", async () => {
    const user = userEvent.setup();
    useEditorStore.setState({
      recentOpenedFilePaths: ["C:\\notes\\root.md"],
    });
    render(<SearchModal isOpen onClose={vi.fn()} />);

    await user.type(screen.getByRole("searchbox"), "root");

    const rootResult = screen.getByRole("option", { name: /root\.md/ });
    expect(rootResult.querySelectorAll("span")).toHaveLength(1);
  });

  it("falls back to open files when recent opened history is empty", () => {
    useEditorStore.setState({
      recentOpenedFilePaths: [],
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

  it("shows up to five recent folders when no workspace is open", async () => {
    const user = userEvent.setup();
    useTreeStore.setState({
      treeRoot: null,
      treeData: [],
      recentFolders: Array.from({ length: 6 }, (_, index) => ({
        title: `folder-${index + 1}`,
        path: `C:\\workspaces\\folder-${index + 1}`,
      })),
    });

    render(<SearchModal isOpen onClose={vi.fn()} />);

    const options = screen.getAllByRole("option");

    expect(screen.queryByText("文件")).not.toBeInTheDocument();
    expect(screen.getByText("目录")).toBeInTheDocument();
    expect(options).toHaveLength(5);
    expect(screen.getByText("folder-1")).toBeInTheDocument();
    expect(screen.queryByText("folder-6")).not.toBeInTheDocument();

    await user.click(screen.getByText("folder-1"));

    expect(loadTree).toHaveBeenCalledWith("C:\\workspaces\\folder-1");
    expect(openFile).not.toHaveBeenCalled();
  });

  it("hides recent folders and searches only files after query input", async () => {
    const user = userEvent.setup();
    useTreeStore.setState({
      recentFolders: [
        {
          title: "workspace-shortcut",
          path: "C:\\workspaces\\workspace-shortcut",
        },
      ],
    });
    render(<SearchModal isOpen onClose={vi.fn()} />);

    await user.type(screen.getByRole("searchbox"), "workspace-shortcut");

    expect(screen.queryByText("目录")).not.toBeInTheDocument();
    expect(screen.queryByText("workspace-shortcut")).not.toBeInTheDocument();
    expect(screen.getByText("没有找到匹配文件")).toBeInTheDocument();
  });

  it("does not search recent folders when no workspace is open", async () => {
    const user = userEvent.setup();
    useTreeStore.setState({
      treeRoot: null,
      treeData: [],
      recentFolders: [{ title: "archive", path: "C:\\workspaces\\archive" }],
    });
    render(<SearchModal isOpen onClose={vi.fn()} />);

    await user.type(screen.getByRole("searchbox"), "archive");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.queryByText("archive")).not.toBeInTheDocument();
    expect(screen.getByText("没有找到匹配文件")).toBeInTheDocument();
  });

  it("opens a folder after keyboard selection crosses the group boundary", async () => {
    const user = userEvent.setup();
    useEditorStore.setState({
      recentOpenedFilePaths: ["C:\\notes\\docs\\first.md"],
      panelGroups: [],
    });
    useTreeStore.setState({
      selectedKey: null,
      recentFolders: [{ title: "archive", path: "C:\\workspaces\\archive" }],
    });
    const onClose = vi.fn();
    render(<SearchModal isOpen onClose={onClose} />);

    await user.keyboard("{ArrowDown}{Enter}");

    expect(loadTree).toHaveBeenCalledWith("C:\\workspaces\\archive");
    expect(openFile).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("omits empty groups and shows one empty default message", () => {
    useTreeStore.setState({
      treeRoot: null,
      treeData: [],
      selectedKey: null,
      recentFolders: [],
    });
    useEditorStore.setState({
      recentOpenedFilePaths: [],
      panelGroups: [],
    });

    render(<SearchModal isOpen onClose={vi.fn()} />);

    expect(screen.queryByText("文件")).not.toBeInTheDocument();
    expect(screen.queryByText("目录")).not.toBeInTheDocument();
    expect(screen.getByText("暂无最近打开的文件或目录")).toBeInTheDocument();
  });

  it("uses the taller grouped result viewport", () => {
    render(<SearchModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole("listbox")).toHaveClass("max-h-[376px]");
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

  it("renders at the document root above body-mounted editor surfaces", () => {
    const container = document.createElement("div");
    document.body.append(container);

    render(<SearchModal isOpen onClose={vi.fn()} />, { container });

    expect(container).toBeEmptyDOMElement();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("closes when clicking outside the compact modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SearchModal isOpen onClose={onClose} />);

    await user.click(document.body);

    expect(onClose).toHaveBeenCalledOnce();
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

  it("switches to the file tree and requests reveal when opening a file result", async () => {
    const user = userEvent.setup();
    const revealListener = vi.fn();
    window.addEventListener(REVEAL_FILE_TREE_NODE_EVENT, revealListener);
    useEditorStore.setState({
      appearance: {
        ...useEditorStore.getState().appearance,
        sidebarView: "outline",
      },
    });

    render(<SearchModal isOpen onClose={vi.fn()} />);

    await user.click(screen.getByText("first.md"));

    expect(useEditorStore.getState().appearance.sidebarView).toBe("file");
    expect(revealListener).toHaveBeenCalledOnce();
    expect(revealListener.mock.calls[0]?.[0]).toMatchObject({
      detail: { key: "C:\\notes\\docs\\first.md", align: "center" },
    });

    window.removeEventListener(REVEAL_FILE_TREE_NODE_EVENT, revealListener);
  });

  it("keeps enter for IME composition before opening the active result", () => {
    const onClose = vi.fn();
    render(<SearchModal isOpen onClose={onClose} />);

    const searchInput = screen.getByRole("searchbox");

    fireEvent.compositionStart(searchInput);
    fireEvent.keyDown(searchInput, { key: "Enter" });

    expect(openFile).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.compositionEnd(searchInput);
    fireEvent.keyDown(searchInput, { key: "Enter" });

    expect(openFile).toHaveBeenCalledWith("C:\\notes\\docs\\first.md");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps hover separate from keyboard active selection", async () => {
    const user = userEvent.setup();
    render(<SearchModal isOpen onClose={vi.fn()} />);

    const searchInput = screen.getByRole("searchbox");
    const options = screen.getAllByRole("option");
    await user.hover(options[1]);

    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");

    await user.click(searchInput);
    await user.keyboard("{ArrowDown}");

    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveClass("bg-[var(--active-bg)]");

    await user.keyboard("{Enter}");

    expect(openFile).toHaveBeenCalledWith("C:\\notes\\docs\\second.txt");
  });

  it("scrolls the active result into view when keyboard selection changes", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<SearchModal isOpen onClose={vi.fn()} />);

    const searchInput = screen.getByRole("searchbox");
    await user.type(searchInput, "docs");
    scrollIntoView.mockClear();

    await user.keyboard("{ArrowDown}");

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });
});
