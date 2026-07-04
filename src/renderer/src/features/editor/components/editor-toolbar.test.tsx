import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorToolbar } from "./editor-toolbar";
import { DIFF_TOAST_EVENT } from "@/features/diff/lib/diff-toast";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";

const electronMocks = vi.hoisted(() => ({
  detectGitRepo: vi.fn(),
  discardChanges: vi.fn(),
  getFileHeadContent: vi.fn(),
  getGitStatus: vi.fn(),
  loadTree: vi.fn(),
}));

const diffStoreMock = vi.hoisted(() => ({
  openDiff: vi.fn(),
  closeDiff: vi.fn(),
  updateContent: vi.fn(),
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => electronMocks,
}));

vi.mock("@/store/diff.store", () => ({
  useDiffStore: (selector: (state: typeof diffStoreMock) => unknown) =>
    selector(diffStoreMock),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    confirmText = "确认",
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
  }) =>
    open ? (
      <button
        type="button"
        onClick={async () => {
          await onConfirm();
          onOpenChange(false);
        }}
      >
        {confirmText}
      </button>
    ) : null,
}));

function openActionMenu() {
  fireEvent.keyDown(screen.getByRole("button", { name: "标签页操作" }), {
    key: "Enter",
    code: "Enter",
  });
}

function renderToolbar({
  onNewTab = vi.fn(),
  onSplitRight = vi.fn(),
  onSplitDown = vi.fn(),
}: {
  onNewTab?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
} = {}) {
  render(
    <EditorToolbar
      groupId="group-1"
      onNewTab={onNewTab}
      onSplitRight={onSplitRight}
      onSplitDown={onSplitDown}
    />,
  );
}

describe("EditorToolbar diff action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    electronMocks.detectGitRepo.mockResolvedValue({
      code: CodeResult.Success,
      data: { isGitRepo: true },
    });
    electronMocks.getFileHeadContent.mockResolvedValue({
      code: CodeResult.Success,
      data: "# same",
    });
    electronMocks.getGitStatus.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        current: "main",
        tracking: "",
        files: [],
        ahead: 0,
        behind: 0,
        created: [],
        not_added: [],
        modified: [],
        deleted: [],
        renamed: [],
        staged: [],
        conflicted: [],
      },
    });
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "/notes" },
    });
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [
            {
              id: "tab-1",
              filePath: "/notes/readme.md",
              pendingFilePath: null,
              content: "# same",
              wordCount: 2,
              isDirty: false,
              reloadKey: 0,
              mode: "rich",
              loadStatus: "ready",
              saveStatus: "clean",
              errorMessage: null,
              parseErrorMessage: null,
              scrollTop: 0,
            },
          ],
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a no-diff toast instead of opening diff when current file has no changes", async () => {
    const toastSpy = vi.fn();
    window.addEventListener(DIFF_TOAST_EVENT, toastSpy);

    renderToolbar();

    await screen.findByRole("button", { name: "标签页操作" });
    openActionMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "比较差异" }));

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

  it("shows a no-change toast after confirming discard when current file has no changes", async () => {
    const toastSpy = vi.fn();
    window.addEventListener(DIFF_TOAST_EVENT, toastSpy);

    renderToolbar();

    await screen.findByRole("button", { name: "标签页操作" });
    openActionMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "放弃更改" }));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalled();
    });
    const toastEvent = toastSpy.mock.calls[0]?.[0] as CustomEvent<{
      message: string;
    }>;
    expect(toastEvent.detail.message).toBe("暂无更改内容");
    expect(electronMocks.discardChanges).not.toHaveBeenCalled();

    window.removeEventListener(DIFF_TOAST_EVENT, toastSpy);
  });

  it("groups tab operations in the same action menu", async () => {
    const onNewTab = vi.fn();
    const onSplitRight = vi.fn();
    const onSplitDown = vi.fn();

    renderToolbar({ onNewTab, onSplitRight, onSplitDown });

    expect(
      screen.queryByRole("button", { name: "比较当前文件差异" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "放弃当前文件更改" }),
    ).not.toBeInTheDocument();

    await screen.findByRole("button", { name: "标签页操作" });
    openActionMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: "向右拆分面板" }));
    expect(onSplitRight).toHaveBeenCalledTimes(1);

    await screen.findByRole("button", { name: "标签页操作" });
    openActionMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "向下拆分面板" }));
    expect(onSplitDown).toHaveBeenCalledTimes(1);

    await screen.findByRole("button", { name: "标签页操作" });
    openActionMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "新建标签页" }));
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  it("orders common actions first and git actions last", async () => {
    renderToolbar();

    await screen.findByRole("button", { name: "标签页操作" });
    openActionMenu();

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "新建标签页",
      "向右拆分面板",
      "向下拆分面板",
      "比较差异",
      "放弃更改",
    ]);
    expect(screen.getByRole("menuitem", { name: "放弃更改" })).not.toHaveStyle({
      color: "var(--danger-color)",
    });
  });

  it("hides git actions when the current folder is not a git repository", async () => {
    electronMocks.detectGitRepo.mockResolvedValue({
      code: CodeResult.Success,
      data: { isGitRepo: false },
    });

    renderToolbar();

    await screen.findByRole("button", { name: "标签页操作" });
    openActionMenu();

    expect(
      screen.queryByRole("menuitem", { name: "比较差异" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "放弃更改" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["新建标签页", "向右拆分面板", "向下拆分面板"]);
  });
});
