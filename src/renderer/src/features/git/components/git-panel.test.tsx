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
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => electronMocks,
}));

vi.mock("@/store/tree.store", () => ({
  useTreeStore: () => ({
    treeRoot: { key: "/notes", title: "notes" },
    setSelectedKey: vi.fn(),
    expandedKeys: new Set<string>(),
    setExpandedKeys: vi.fn(),
  }),
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
    fireEvent.click(screen.getByText("更改"));

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
      screen.getByText("更改").closest(".overflow-x-hidden"),
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
});
