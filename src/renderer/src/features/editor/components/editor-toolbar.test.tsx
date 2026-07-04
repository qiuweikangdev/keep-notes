import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("shows a no-diff toast instead of opening diff when current file has no changes", async () => {
    const toastSpy = vi.fn();
    window.addEventListener(DIFF_TOAST_EVENT, toastSpy);

    render(<EditorToolbar groupId="group-1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "比较当前文件差异" }),
    );

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

    render(<EditorToolbar groupId="group-1" />);

    fireEvent.click(
      await screen.findByRole("button", { name: "放弃当前文件更改" }),
    );
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
});
