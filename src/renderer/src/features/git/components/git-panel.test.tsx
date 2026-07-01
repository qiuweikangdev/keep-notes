import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeResult } from "@/types";
import { GitPanel } from "./git-panel";

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
}));

const treeStoreMock = vi.hoisted(() => ({
  treeRoot: { key: "/notes", title: "notes" },
  setSelectedKey: vi.fn(),
  expandedKeys: new Set<string>(),
  setExpandedKeys: vi.fn(),
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => electronMocks,
}));

vi.mock("@/store/tree.store", () => ({
  useTreeStore: () => treeStoreMock,
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
  useDiffStore: () => ({
    openDiff: vi.fn(),
    closeDiff: vi.fn(),
    updateContent: vi.fn(),
  }),
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
    vi.clearAllMocks();
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
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the Git panel open when the discard confirmation dialog closes", async () => {
    const onClose = vi.fn();
    render(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "提交" })).not.toBeDisabled();
    });
    fireEvent.click(screen.getAllByTitle("放弃更改")[0]);

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

  it("adds tips to icon-only controls and hides the single-line commit scrollbar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GitPanel isOpen onClose={onClose} />);

    await screen.findByText("changed.md");

    expect(screen.getByTitle("切换分支")).toBeInTheDocument();
    expect(screen.getByTitle("创建新分支")).toBeInTheDocument();
    expect(screen.getByTitle("切换为树形视图")).toBeInTheDocument();
    expect(screen.getByTitle("全部暂存")).toBeInTheDocument();
    expect(screen.getByTitle("全部暂存").parentElement).toHaveClass(
      "git-panel-tooltip--align-end",
    );
    expect(
      screen
        .getByRole("button", { name: "收起更改" })
        .closest(".overflow-x-hidden"),
    ).toBeInTheDocument();
    expect(screen.getAllByTitle("查看差异").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("打开文件").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("放弃更改").length).toBeGreaterThan(0);
    await user.hover(screen.getByTitle("切换为树形视图"));
    await expectTooltipContent("切换为树形视图");
    await user.unhover(screen.getByTitle("切换为树形视图"));

    await user.hover(screen.getByText("changed.md"));
    await user.hover(screen.getAllByTitle("查看差异")[0]);
    await expectTooltipContent("查看差异");

    expect(
      screen.getByPlaceholderText("提交信息（留空将自动生成）..."),
    ).toHaveClass("overflow-hidden");
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
    expect(screen.queryByRole("tab", { name: "历史" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看 Git 历史" }));

    expect(
      await screen.findByText("feat: add git history"),
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByTitle("加载更多历史"));

    await screen.findByText("fix: load more history");
    expect(electronMocks.getCommitHistory).toHaveBeenCalledWith("/notes", 5, 5);

    fireEvent.click(screen.getByRole("button", { name: "查看文件状态" }));
    expect(await screen.findByText("changed.md")).toBeInTheDocument();
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
