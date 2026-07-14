import {
  act,
  cleanup,
  createEvent,
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
import { DIFF_TOAST_EVENT } from "@/features/diff/lib/diff-toast";
import { APP_TOAST_EVENT } from "@/lib/app-toast";
import { REVEAL_FILE_TREE_NODE_EVENT } from "../utils";
import { registerEditorOutlineNavigator } from "@/features/editor/lib/editor-outline-navigation";
import { richDocumentSessionManager } from "@/features/editor/lib/editor-runtime";

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

const virtualizerScrollToIndex = vi.hoisted(() => vi.fn());

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
    scrollToIndex: virtualizerScrollToIndex,
  }),
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => electronMocks,
}));

vi.mock("@/store/diff.store", () => ({
  useDiffStore: (selector: (state: typeof diffStoreMock) => unknown) =>
    selector(diffStoreMock),
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

  it("marks the virtualized file tree scroll container for hover scrollbar styling", () => {
    const { container } = render(<FileTree />);

    expect(
      container.querySelector(".file-tree-scroll-container"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".file-tree-scrollbar-thumb"),
    ).toBeInTheDocument();
  });

  it("scrolls the file tree when clicking the custom scrollbar track", () => {
    const { container } = render(<FileTree />);
    const scrollContainer = container.querySelector(
      ".file-tree-scroll-container",
    ) as HTMLDivElement;
    const scrollbarTrack = container.querySelector(
      ".file-tree-scrollbar-track",
    ) as HTMLDivElement;

    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    vi.spyOn(scrollbarTrack, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 8,
      top: 0,
      width: 8,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const pointerDown = createEvent.pointerDown(scrollbarTrack);
    Object.defineProperty(pointerDown, "clientY", {
      configurable: true,
      value: 50,
    });
    fireEvent(scrollbarTrack, pointerDown);

    expect(scrollContainer.scrollTop).toBe(450);
  });

  it("shows an export action from the virtualized file node menu", async () => {
    render(<FileTree />);

    fireEvent.contextMenu(await screen.findByText("daily.md"));

    expect(
      await screen.findByRole("menuitem", { name: /导出/ }),
    ).toBeInTheDocument();
  });

  it("keeps the file tree scroll position when switching files from the tree", async () => {
    render(<FileTree />);

    fireEvent.click(await screen.findByText("daily.md"));

    await waitFor(() => {
      expect(electronMocks.openFile).toHaveBeenCalledWith("/notes/daily.md");
    });
    await act(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    expect(virtualizerScrollToIndex).not.toHaveBeenCalled();
  });

  it("keeps same-file outline selection and navigation isolated by pane", async () => {
    const path = "/notes/daily.md";
    const firstNavigate = vi.fn(() => true);
    const secondNavigate = vi.fn(() => true);
    const unregisterFirst = registerEditorOutlineNavigator(
      "group-1",
      "tab-1",
      firstNavigate,
    );
    const unregisterSecond = registerEditorOutlineNavigator(
      "group-2",
      "tab-2",
      secondNavigate,
    );
    const createTab = (id: string) => ({
      id,
      filePath: path,
      pendingFilePath: null,
      content: "# Intro\n## Details",
      wordCount: 18,
      isDirty: false,
      reloadKey: 0,
      mode: "rich" as const,
      loadStatus: "ready" as const,
      saveStatus: "clean" as const,
      errorMessage: null,
      parseErrorMessage: null,
      scrollTop: 0,
    });
    useEditorStore.setState({
      activeGroupId: "group-1",
      appearance: {
        ...useEditorStore.getState().appearance,
        sidebarView: "outline",
      },
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [createTab("tab-1")],
        },
        {
          id: "group-2",
          activeTabId: "tab-2",
          direction: "horizontal",
          tabs: [createTab("tab-2")],
        },
      ],
      outlineHeadingsByPath: {
        [path]: [
          { id: "heading-1", text: "Intro", level: 1 },
          { id: "heading-2", text: "Details", level: 2 },
        ],
      },
      activeHeadingIdByPane: {
        "group-1:tab-1": "heading-1",
        "group-2:tab-2": "heading-2",
      },
    });

    render(<FileTree />);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(firstNavigate).toHaveBeenCalledWith("heading-2", {
      isRetry: false,
    });
    expect(useEditorStore.getState().activeHeadingIdByPane).toMatchObject({
      "group-1:tab-1": "heading-2",
      "group-2:tab-2": "heading-2",
    });

    act(() => useEditorStore.getState().setActiveTab("group-2", "tab-2"));
    const staleManagerBinding = vi
      .spyOn(richDocumentSessionManager, "getActiveBinding")
      .mockReturnValue({
        path,
        binding: {
          groupId: "group-1",
          paneKey: "group-1:tab-1",
          tabId: "tab-1",
        },
      });
    fireEvent.click(screen.getByRole("button", { name: "Intro" }));
    expect(secondNavigate).toHaveBeenCalledWith("heading-1", {
      isRetry: false,
    });
    expect(useEditorStore.getState().activeHeadingIdByPane).toMatchObject({
      "group-1:tab-1": "heading-2",
      "group-2:tab-2": "heading-1",
    });
    expect(staleManagerBinding).not.toHaveBeenCalled();

    staleManagerBinding.mockRestore();
    unregisterFirst();
    unregisterSecond();
  });

  it("opens the diff dialog from the virtualized file node menu", async () => {
    render(<FileTree />);

    fireEvent.contextMenu(await screen.findByText("daily.md"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /比较差异/ }));

    await waitFor(() => {
      expect(diffStoreMock.openDiff).toHaveBeenCalledWith(
        "/notes/daily.md",
        "head content",
        "worktree content",
      );
    });
    await waitFor(() => {
      expect(diffStoreMock.updateContent).toHaveBeenCalledWith(
        "head content",
        "worktree content",
      );
    });
  });

  it("shows a no-diff toast instead of opening diff from the virtualized file node menu", async () => {
    const toastSpy = vi.fn();
    window.addEventListener(DIFF_TOAST_EVENT, toastSpy);
    electronMocks.getFileHeadContent.mockResolvedValue({
      code: CodeResult.Success,
      data: "worktree content",
    });

    render(<FileTree />);

    fireEvent.contextMenu(await screen.findByText("daily.md"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /比较差异/ }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalled();
    });
    const toastEvent = toastSpy.mock.calls[0]?.[0] as CustomEvent<{
      message: string;
    }>;
    expect(toastEvent.detail.message).toBe("暂无差异内容");
    expect(diffStoreMock.openDiff).not.toHaveBeenCalled();

    window.removeEventListener(DIFF_TOAST_EVENT, toastSpy);
  });

  it("shows a toast when renaming to an existing name", async () => {
    const toastSpy = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastSpy);
    electronMocks.renameItem.mockResolvedValue({
      code: CodeResult.Fail,
      message: "“published.md”已存在，请使用其他名称",
    });

    render(<FileTree />);

    fireEvent.contextMenu(await screen.findByText("daily.md"));
    fireEvent.click(await screen.findByRole("menuitem", { name: /重命名/ }));
    const input = await screen.findByDisplayValue("daily");
    fireEvent.change(input, { target: { value: "published" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledTimes(1);
    });
    const toastEvent = toastSpy.mock.calls[0]?.[0] as CustomEvent<{
      message: string;
    }>;
    expect(toastEvent.detail.message).toBe(
      "“published.md”已存在，请使用其他名称",
    );

    window.removeEventListener(APP_TOAST_EVENT, toastSpy);
  });

  it("shows a toast when creating a file with an existing name", async () => {
    const toastSpy = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastSpy);
    electronMocks.createFile.mockResolvedValue({
      code: CodeResult.Fail,
      message: "“daily.md”已存在，请使用其他名称",
    });

    const { container } = render(<FileTree />);

    const rootNode = container.querySelector(".tree-node-root");
    expect(rootNode).not.toBeNull();
    fireEvent.contextMenu(rootNode!);
    fireEvent.click(await screen.findByRole("menuitem", { name: /新建文件$/ }));
    const input = await screen.findByPlaceholderText("输入文件名称");
    fireEvent.change(input, { target: { value: "daily" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledTimes(1);
    });
    const toastEvent = toastSpy.mock.calls[0]?.[0] as CustomEvent<{
      message: string;
    }>;
    expect(toastEvent.detail.message).toBe("“daily.md”已存在，请使用其他名称");

    window.removeEventListener(APP_TOAST_EVENT, toastSpy);
  });

  it("expands ancestors and scrolls to a file tree reveal request", async () => {
    useTreeStore.setState({
      treeData: [
        {
          title: "projects",
          key: "/notes/projects",
          children: [
            {
              title: "app",
              key: "/notes/projects/app",
              children: [
                {
                  title: "readme.md",
                  key: "/notes/projects/app/readme.md",
                },
              ],
            },
          ],
        },
      ],
      expandedKeys: new Set(["/notes"]),
    });

    render(<FileTree />);

    fireEvent(
      window,
      new CustomEvent(REVEAL_FILE_TREE_NODE_EVENT, {
        detail: { key: "/notes/projects/app/readme.md", align: "center" },
      }),
    );

    await waitFor(() => {
      expect(useTreeStore.getState().expandedKeys).toEqual(
        new Set(["/notes", "/notes/projects", "/notes/projects/app"]),
      );
    });
    expect(await screen.findByText("readme.md")).toBeInTheDocument();
    await waitFor(() => {
      expect(virtualizerScrollToIndex).toHaveBeenCalledWith(2, {
        align: "center",
      });
    });
  });
});
