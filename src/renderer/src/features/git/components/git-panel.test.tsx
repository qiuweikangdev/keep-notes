import {
  cleanup,
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DragResizeProvider } from "@/components/drag-resize-provider";
import { CodeResult } from "@/types";
import { notifyGitStatusChange } from "../lib/git-status-change";
import { GitPanel } from "./git-panel";

const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) =>
  baseRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <DragResizeProvider debounceMs={0}>{children}</DragResizeProvider>
    ),
  });

const electronMocks = vi.hoisted(() => ({
  detectGitRepo: vi.fn(),
  getBranches: vi.fn(),
  switchBranch: vi.fn(),
  createBranch: vi.fn(),
  getGitStatus: vi.fn(),
  addFilesToStaging: vi.fn(),
  unstageFiles: vi.fn(),
  commitChanges: vi.fn(),
  pushToRemote: vi.fn(),
  pullFromRemote: vi.fn(),
  discardChanges: vi.fn(),
  openFile: vi.fn(),
  loadTree: vi.fn(),
  getFileHeadContent: vi.fn(),
  getCommitHistory: vi.fn(),
  getCommitDetail: vi.fn(),
  getCommitFileContent: vi.fn(),
}));

const treeStoreMock = vi.hoisted(() => ({
  treeRoot: { key: "/notes", title: "notes" },
  setSelectedKey: vi.fn(),
  expandedKeys: new Set<string>(),
  setExpandedKeys: vi.fn(),
}));

const diffStoreMock = vi.hoisted(() => ({
  openDiff: vi.fn(),
  closeDiff: vi.fn(),
  updateContent: vi.fn(),
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => electronMocks,
}));

vi.mock("@/store/tree.store", () => ({
  useTreeStore: <T,>(selector: (state: typeof treeStoreMock) => T) =>
    selector(treeStoreMock),
}));

vi.mock("@/store/editor.store", () => ({
  useEditorStore: {
    getState: () => ({
      filePath: "/notes/changed.md",
      panelGroups: [],
    }),
  },
}));

vi.mock("@/store/diff.store", () => ({
  useDiffStore: <T,>(selector: (state: typeof diffStoreMock) => T) =>
    selector(diffStoreMock),
}));

describe("GitPanel", () => {
  const expectTooltipContent = async (label: string) => {
    const tips = await screen.findAllByText(label);
    expect(
      tips.some(
        (tip) =>
          tip instanceof HTMLElement &&
          tip.classList.contains("git-panel-tooltip__content"),
      ),
    ).toBe(true);
  };

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue("working tree content"),
      },
    });
    treeStoreMock.treeRoot = { key: "/notes", title: "notes" };
    treeStoreMock.expandedKeys = new Set<string>();
    electronMocks.detectGitRepo.mockResolvedValue({
      code: CodeResult.Success,
      data: { isGitRepo: true },
    });
    electronMocks.getBranches.mockResolvedValue({
      code: CodeResult.Success,
      data: [{ name: "main", current: true }],
    });
    electronMocks.getGitStatus.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        current: "main",
        tracking: "origin/main",
        files: [],
        ahead: 0,
        behind: 0,
        created: [],
        not_added: ["new.md"],
        modified: ["changed.md"],
        deleted: ["removed.md"],
        renamed: [],
        staged: [],
        conflicted: [],
      },
    });
    electronMocks.discardChanges.mockResolvedValue({
      code: CodeResult.Success,
    });
    electronMocks.addFilesToStaging.mockResolvedValue({
      code: CodeResult.Success,
    });
    electronMocks.unstageFiles.mockResolvedValue({
      code: CodeResult.Success,
    });
    electronMocks.loadTree.mockResolvedValue(undefined);
    electronMocks.openFile.mockResolvedValue(undefined);
    electronMocks.getCommitHistory.mockResolvedValue({
      code: CodeResult.Success,
      data: [
        {
          hash: "1111111111111111111111111111111111111111",
          shortHash: "1111111",
          subject: "feat: add git history",
          authorName: "qiuweikang",
          authorEmail: "qiuweikang@example.com",
          date: "2026-07-01T10:00:00+08:00",
        },
      ],
    });
    electronMocks.getCommitDetail.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        hash: "1111111111111111111111111111111111111111",
        shortHash: "1111111",
        parents: ["0000000000000000000000000000000000000000"],
        authorName: "qiuweikang",
        authorEmail: "qiuweikang@example.com",
        committerName: "qiuweikang",
        committerEmail: "qiuweikang@example.com",
        date: "2026-07-01T10:00:00+08:00",
        subject: "feat: add git history",
        body: "feat: add git history",
        files: [
          {
            path: "src/renderer/src/features/git/components/git-panel.tsx",
            status: "M",
            additions: 12,
            deletions: 3,
          },
        ],
      },
    });
    electronMocks.getCommitFileContent.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        oldContent: "old content",
        newContent: "new content",
      },
    });
    electronMocks.getFileHeadContent.mockResolvedValue({
      code: CodeResult.Success,
      data: "head content",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("uses responsive shared geometry for the main Git surface", async () => {
    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");
    const dialog = document.querySelector<HTMLElement>(
      '[data-git-dialog="main"]',
    );
    expect(dialog).toHaveClass(
      "h-[min(82vh,calc(100vh-32px))]",
      "max-h-none",
      "w-[min(680px,calc(100vw-32px))]",
      "max-w-none",
    );
    expect(
      dialog?.querySelector("[data-dialog-drag-handle]"),
    ).toBeInTheDocument();
    expect(
      dialog?.querySelectorAll("[data-dialog-resize-handle]"),
    ).toHaveLength(8);
  });

  it("anchors drag coordinates to the viewport instead of the centered flex layout", async () => {
    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");
    expect(
      document.querySelector<HTMLElement>('[data-git-dialog="main"]'),
    ).toHaveClass(
      "fixed",
      "left-1/2",
      "top-1/2",
      "-translate-x-1/2",
      "-translate-y-1/2",
    );
  });

  it("keeps the Git loading surface compact but viewport safe", () => {
    electronMocks.detectGitRepo.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<GitPanel isOpen onClose={vi.fn()} />);

    expect(
      screen.getByRole("status").closest('[data-git-dialog="loading"]'),
    ).toHaveClass(
      "w-[calc(100vw-32px)]",
      "max-w-[400px]",
      "max-h-[calc(100vh-32px)]",
    );
  });

  it("keeps the non-repository surface compact but viewport safe", async () => {
    electronMocks.detectGitRepo.mockResolvedValueOnce({
      code: CodeResult.Success,
      data: { isGitRepo: false },
    });

    render(<GitPanel isOpen onClose={vi.fn()} />);

    await waitFor(() => {
      expect(
        document.querySelector('[data-git-dialog="not-repository"]'),
      ).toBeInTheDocument();
    });
    expect(
      document.querySelector('[data-git-dialog="not-repository"]'),
    ).toHaveClass(
      "w-[calc(100vw-32px)]",
      "max-w-[400px]",
      "max-h-[calc(100vh-32px)]",
    );
  });

  it("restores default Git geometry after reopening", async () => {
    const { rerender } = render(<GitPanel isOpen onClose={vi.fn()} />);
    await screen.findByText("changed.md");
    const dialog = document.querySelector<HTMLElement>(
      '[data-git-dialog="main"]',
    );
    expect(dialog).not.toBeNull();
    dialog!.style.width = "540px";
    dialog!.style.left = "32px";

    rerender(<GitPanel isOpen={false} onClose={vi.fn()} />);
    rerender(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");
    const reopened = document.querySelector<HTMLElement>(
      '[data-git-dialog="main"]',
    );
    expect(reopened?.style.width).toBe("");
    expect(reopened?.style.left).toBe("");
  });

  it("renders at the document root above body-mounted editor surfaces", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const { unmount } = render(<GitPanel isOpen onClose={vi.fn()} />, {
      container,
    });

    try {
      await screen.findByText("changed.md");

      expect(container).toBeEmptyDOMElement();
    } finally {
      unmount();
      container.remove();
    }
  });

  it("keeps Git detection and file status in loading states while opening", async () => {
    const { rerender } = render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");

    let resolveGitRepo: (value: unknown) => void;
    let resolveGitStatus: (value: unknown) => void;
    electronMocks.detectGitRepo.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGitRepo = resolve;
        }),
    );
    electronMocks.getGitStatus.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGitStatus = resolve;
        }),
    );

    rerender(<GitPanel isOpen={false} onClose={vi.fn()} />);
    rerender(<GitPanel isOpen onClose={vi.fn()} />);

    await waitFor(() => {
      expect(document.querySelector('[role="status"]')).toBeInTheDocument();
    });
    expect(screen.queryByText("正在检查 Git 仓库...")).not.toBeInTheDocument();
    expect(screen.queryByText("当前目录不是 Git 仓库")).not.toBeInTheDocument();

    resolveGitRepo!({
      code: CodeResult.Success,
      data: { isGitRepo: true },
    });

    await waitFor(() => {
      expect(document.querySelector('[role="status"]')).toBeInTheDocument();
    });
    expect(
      screen.queryByText("正在加载 Git 文件状态..."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("无更改")).not.toBeInTheDocument();

    resolveGitStatus!({
      code: CodeResult.Success,
      data: {
        current: "main",
        tracking: "origin/main",
        files: [],
        ahead: 0,
        behind: 0,
        created: [],
        not_added: [],
        modified: ["changed.md"],
        deleted: [],
        renamed: [],
        staged: [],
        conflicted: [],
      },
    });

    expect(await screen.findByText("changed.md")).toBeInTheDocument();
  });

  it("keeps the changes list visible while refreshing Git status", async () => {
    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");

    let resolveStatus: (value: unknown) => void;
    electronMocks.getGitStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );

    fireEvent.click(screen.getAllByLabelText("放弃更改")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(electronMocks.getGitStatus).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("changed.md")).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "正在刷新文件状态" }),
    ).toBeInTheDocument();

    resolveStatus!({
      code: CodeResult.Success,
      data: {
        current: "main",
        tracking: "origin/main",
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

    expect(await screen.findByText("无更改")).toBeInTheDocument();
  });

  it.each([
    ["拉取", electronMocks.pullFromRemote],
    ["推送", electronMocks.pushToRemote],
    ["提交", electronMocks.commitChanges],
    ["提交并推送", electronMocks.commitChanges],
  ])(
    "shows a matching loader and overlay while %s is pending",
    async (label, operation) => {
      let resolveOperation: (value: { code: CodeResult }) => void;
      operation.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOperation = resolve;
          }),
      );

      render(<GitPanel isOpen onClose={vi.fn()} />);

      await screen.findByText("changed.md");
      const button = screen.getByRole("button", { name: label });
      expect(button.querySelector("svg")).toBeInTheDocument();

      fireEvent.click(button);

      expect(button).toHaveAttribute("aria-busy", "true");
      expect(
        screen.getByRole("status", { name: "Git 操作进行中" }),
      ).toBeInTheDocument();

      resolveOperation!({ code: CodeResult.Success });

      await waitFor(() => {
        expect(button).toHaveAttribute("aria-busy", "false");
      });
      expect(
        screen.queryByRole("status", { name: "Git 操作进行中" }),
      ).not.toBeInTheDocument();
    },
  );

  it("uses optically balanced icons for commit footer actions", async () => {
    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");

    for (const label of ["提交", "提交并推送"]) {
      expect(
        screen.getByRole("button", { name: label }).querySelector("svg"),
      ).toHaveClass("h-4", "w-4");
    }
  });

  it("keeps the Git panel open when the discard confirmation dialog closes", async () => {
    const onClose = vi.fn();
    render(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "提交" })).not.toBeDisabled();
    });
    fireEvent.click(screen.getAllByLabelText("放弃更改")[0]);

    expect(await screen.findByText("确认放弃更改")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => {
      expect(screen.queryByText("确认放弃更改")).not.toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    cleanup();
  });

  it("does not switch or show a toast when selecting the current branch", async () => {
    electronMocks.getBranches.mockResolvedValue({
      code: CodeResult.Success,
      data: [
        { name: "develop", current: true },
        { name: "main", current: false },
      ],
    });
    const onClose = vi.fn();
    render(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");
    fireEvent.click(await screen.findByRole("button", { name: /develop/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /develop/ })[1]);

    expect(electronMocks.switchBranch).not.toHaveBeenCalled();
    expect(screen.queryByText("已切换到分支: develop")).not.toBeInTheDocument();
  });

  it("collapses a file status section when clicking its disclosure header", async () => {
    const onClose = vi.fn();
    render(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");
    expect(screen.queryByTitle("收起更改")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收起更改" }));

    expect(screen.queryByText("changed.md")).not.toBeInTheDocument();
  });

  it("opens a diff when clicking a file in the status list", async () => {
    render(<GitPanel isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText("changed.md"));

    await waitFor(() => {
      expect(electronMocks.getFileHeadContent).toHaveBeenCalledWith(
        "/notes",
        "changed.md",
      );
      expect(diffStoreMock.openDiff).toHaveBeenCalledWith(
        "changed.md",
        "head content",
        "working tree content",
      );
    });
  });

  it("refreshes file status after another dialog discards changes", async () => {
    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");
    electronMocks.getGitStatus.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        current: "main",
        tracking: "origin/main",
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

    notifyGitStatusChange("/notes");

    await waitFor(() => {
      expect(electronMocks.getGitStatus).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("changed.md")).not.toBeInTheDocument();
    });
  });

  it("adds tips to icon-only controls and hides the single-line commit scrollbar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");

    expect(screen.getByTitle("切换分支")).toBeInTheDocument();
    expect(screen.getByLabelText("创建新分支")).toBeInTheDocument();
    expect(screen.getByTitle("切换为树形视图")).toBeInTheDocument();
    expect(screen.getByLabelText("全部暂存")).toBeInTheDocument();
    expect(screen.getByLabelText("全部暂存").parentElement).toHaveClass(
      "git-panel-tooltip--align-end",
    );
    expect(
      screen
        .getByRole("button", { name: "收起更改" })
        .closest(".overflow-x-hidden"),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("查看差异").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("打开文件").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("放弃更改").length).toBeGreaterThan(0);
    await user.hover(screen.getByTitle("切换为树形视图"));
    await expectTooltipContent("切换为树形视图");
    await user.unhover(screen.getByTitle("切换为树形视图"));

    await user.hover(screen.getByText("changed.md"));
    await user.hover(screen.getAllByLabelText("查看差异")[0]);
    await expectTooltipContent("查看差异");

    expect(
      screen.getByPlaceholderText("提交信息（留空将自动生成）..."),
    ).toHaveClass("overflow-hidden");
  });

  it("adds section actions for discarding and unstaging all changes", async () => {
    electronMocks.getGitStatus.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        current: "main",
        tracking: "origin/main",
        files: [],
        ahead: 0,
        behind: 0,
        created: [],
        not_added: ["new.md"],
        modified: ["changed.md"],
        deleted: [],
        renamed: [],
        staged: ["changed.md"],
        conflicted: [],
      },
    });

    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");

    expect(screen.getByLabelText("取消暂存所有更改")).toBeInTheDocument();
    expect(screen.getByLabelText("放弃所有更改")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("放弃所有更改"));
    expect(await screen.findByText("确认放弃更改")).toBeInTheDocument();
    expect(screen.getByText("确定要放弃所有更改吗？")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(electronMocks.discardChanges).toHaveBeenCalledWith(
        "/notes",
        "new.md",
      );
    });
    expect(electronMocks.unstageFiles).not.toHaveBeenCalled();
    expect(electronMocks.discardChanges).not.toHaveBeenCalledWith(
      "/notes",
      "changed.md",
    );
  });

  it("switches between file status and git history with compact icon controls", async () => {
    electronMocks.getCommitHistory
      .mockResolvedValueOnce({
        code: CodeResult.Success,
        data: Array.from({ length: 5 }, (_, index) => ({
          hash: `${index + 1}`.repeat(40).slice(0, 40),
          shortHash: `${index + 1}`.repeat(7).slice(0, 7),
          subject:
            index === 0 ? "feat: add git history" : `docs: history ${index}`,
          authorName: "qiuweikang",
          authorEmail: "qiuweikang@example.com",
          date: "2026-07-01T10:00:00+08:00",
        })),
      })
      .mockResolvedValueOnce({
        code: CodeResult.Success,
        data: [
          {
            hash: "6666666666666666666666666666666666666666",
            shortHash: "6666666",
            subject: "fix: load more history",
            authorName: "qiuweikang",
            authorEmail: "qiuweikang@example.com",
            date: "2026-07-01T11:00:00+08:00",
          },
        ],
      });

    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");
    expect(screen.getByText("Git 操作").closest(".shadow-2xl")).toHaveClass(
      "h-[min(82vh,calc(100vh-32px))]",
    );
    expect(screen.queryByRole("tab", { name: "历史" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看 Git 历史" }));

    expect(
      await screen.findByText("feat: add git history"),
    ).toBeInTheDocument();
    expect(screen.queryByText("1111111")).not.toBeInTheDocument();
    expect(electronMocks.getCommitHistory).toHaveBeenCalledWith("/notes", 0, 5);
    expect(electronMocks.getCommitDetail).not.toHaveBeenCalled();
    expect(
      screen.queryByText(
        "src/renderer/src/features/git/components/git-panel.tsx",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("feat: add git history"));

    expect(
      await screen.findByText(
        "src/renderer/src/features/git/components/git-panel.tsx",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看差异" }));

    expect(diffStoreMock.openDiff).toHaveBeenCalledWith(
      "src/renderer/src/features/git/components/git-panel.tsx",
      "",
      "",
      { source: "history" },
    );
    expect(electronMocks.getCommitFileContent).toHaveBeenCalledWith(
      "/notes",
      "1111111111111111111111111111111111111111",
      "src/renderer/src/features/git/components/git-panel.tsx",
      "M",
      undefined,
    );
    await waitFor(() => {
      expect(diffStoreMock.updateContent).toHaveBeenCalledWith(
        "old content",
        "new content",
      );
    });

    fireEvent.click(screen.getByTitle("加载更多历史"));

    await screen.findByText("fix: load more history");
    expect(electronMocks.getCommitHistory).toHaveBeenCalledWith("/notes", 5, 5);

    fireEvent.click(screen.getByRole("button", { name: "查看文件状态" }));
    expect(await screen.findByText("changed.md")).toBeInTheDocument();
  });

  it("provides diff and open controls for commit files, except deleted files", async () => {
    electronMocks.getCommitDetail.mockResolvedValueOnce({
      code: CodeResult.Success,
      data: {
        hash: "1111111111111111111111111111111111111111",
        shortHash: "1111111",
        parents: ["0000000000000000000000000000000000000000"],
        authorName: "qiuweikang",
        authorEmail: "qiuweikang@example.com",
        committerName: "qiuweikang",
        committerEmail: "qiuweikang@example.com",
        date: "2026-07-01T10:00:00+08:00",
        subject: "feat: add git history",
        body: "feat: add git history",
        files: [
          {
            path: "changed.md",
            status: "M",
            additions: 2,
            deletions: 1,
          },
          {
            path: "removed.md",
            status: "D",
            additions: 0,
            deletions: 4,
          },
        ],
      },
    });

    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");
    fireEvent.click(screen.getByRole("button", { name: "查看 Git 历史" }));
    fireEvent.click(await screen.findByText("feat: add git history"));

    const diffButtons = await screen.findAllByRole("button", {
      name: "查看差异",
    });
    expect(diffButtons).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "打开 changed.md" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "打开 removed.md" }),
    ).not.toBeInTheDocument();

    fireEvent.click(diffButtons[0]);
    expect(electronMocks.getCommitFileContent).toHaveBeenCalledWith(
      "/notes",
      "1111111111111111111111111111111111111111",
      "changed.md",
      "M",
      undefined,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开 changed.md" }));
    await waitFor(() => {
      expect(electronMocks.openFile).toHaveBeenCalledWith("/notes/changed.md");
    });
  });

  it("resets transient state whenever the Git panel opens", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");
    await user.type(
      screen.getByPlaceholderText("提交信息（留空将自动生成）..."),
      "draft message",
    );
    fireEvent.click(screen.getByRole("button", { name: "查看 Git 历史" }));
    expect(
      await screen.findByText("feat: add git history"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("feat: add git history"));
    expect(
      await screen.findByText(
        "src/renderer/src/features/git/components/git-panel.tsx",
      ),
    ).toBeInTheDocument();

    rerender(<GitPanel isOpen={false} onClose={onClose} />);
    rerender(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");
    expect(screen.getByText("文件状态")).toBeInTheDocument();
    expect(screen.queryByText("feat: add git history")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("提交信息（留空将自动生成）..."),
    ).toHaveValue("");
    expect(diffStoreMock.closeDiff).toHaveBeenCalled();
  });

  it("keeps panel state when the workspace tree refreshes without changing root path", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");
    await user.type(
      screen.getByPlaceholderText("提交信息（留空将自动生成）..."),
      "draft message",
    );

    treeStoreMock.treeRoot = { key: "/notes", title: "notes refreshed" };
    rerender(<GitPanel isOpen onClose={vi.fn()} />);

    expect(
      screen.getByPlaceholderText("提交信息（留空将自动生成）..."),
    ).toHaveValue("draft message");
    expect(screen.getByText("changed.md")).toBeInTheDocument();
  });

  it("hides the view switch tip after toggling between file status and git history", async () => {
    const user = userEvent.setup();
    render(<GitPanel isOpen onClose={vi.fn()} />);

    await screen.findByText("changed.md");

    const historyButton = screen.getByRole("button", { name: "查看 Git 历史" });
    expect(historyButton).not.toHaveAttribute("title");
    await user.hover(historyButton);
    await expectTooltipContent("查看 Git 历史");
    expect(historyButton.closest(".git-panel-tooltip")).toHaveClass(
      "git-panel-tooltip--visible",
    );
    await user.click(historyButton);

    expect(historyButton.closest(".git-panel-tooltip")).toHaveClass(
      "git-panel-tooltip--hidden",
    );
    expect(
      await screen.findByText("feat: add git history"),
    ).toBeInTheDocument();

    const fileStatusButton = screen.getByRole("button", {
      name: "查看文件状态",
    });
    expect(fileStatusButton).not.toHaveAttribute("title");
    await user.hover(fileStatusButton);
    await user.click(fileStatusButton);

    expect(fileStatusButton.closest(".git-panel-tooltip")).toHaveClass(
      "git-panel-tooltip--hidden",
    );
    expect(await screen.findByText("changed.md")).toBeInTheDocument();
  });
});
