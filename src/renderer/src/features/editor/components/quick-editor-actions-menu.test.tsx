import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickEditorActionsMenu } from "./quick-editor-actions-menu";

describe("quick editor actions menu", () => {
  afterEach(cleanup);

  it("uses one trigger and exposes uniformly styled actions", async () => {
    const handlers = {
      onToggleEditorMode: vi.fn(),
      onToggleOutline: vi.fn(),
      onNewWindow: vi.fn(),
      onReturnToApplication: vi.fn(),
      onCloseWindow: vi.fn(),
    };
    render(
      <QuickEditorActionsMenu
        isOutlineOpen={false}
        isOutlineDisabled={false}
        {...handlers}
      />,
    );
    expect(screen.getByRole("button", { name: "更多操作" })).toHaveClass(
      "quick-editor-window__action--menu",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "更多操作" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "编辑模式切换",
      "显示大纲",
      "新建浮动窗口",
      "返回主窗口",
      "关闭浮动窗口",
    ]);
    expect(screen.queryByText(/Ctrl|Cmd|Shift/)).not.toBeInTheDocument();
    expect(new Set(items.map((item) => item.className)).size).toBe(1);
    expect(
      screen
        .getByRole("menuitem", { name: "编辑模式切换" })
        .querySelector("svg"),
    ).toHaveClass("lucide-arrow-left-right");
    expect(
      document.querySelectorAll(".quick-editor-actions-menu__separator"),
    ).toHaveLength(2);
  });

  it("forwards every action and switches the outline label", async () => {
    const user = userEvent.setup();
    const handlers = {
      onToggleEditorMode: vi.fn(),
      onToggleOutline: vi.fn(),
      onNewWindow: vi.fn(),
      onReturnToApplication: vi.fn(),
      onCloseWindow: vi.fn(),
    };
    const { rerender } = render(
      <QuickEditorActionsMenu
        isOutlineOpen={false}
        isOutlineDisabled={false}
        {...handlers}
      />,
    );

    const trigger = screen.getByRole("button", { name: "更多操作" });
    for (const [name, handler] of [
      ["编辑模式切换", handlers.onToggleEditorMode],
      ["显示大纲", handlers.onToggleOutline],
      ["新建浮动窗口", handlers.onNewWindow],
      ["返回主窗口", handlers.onReturnToApplication],
      ["关闭浮动窗口", handlers.onCloseWindow],
    ] as const) {
      await user.click(trigger);
      await user.click(screen.getByRole("menuitem", { name }));
      expect(handler).toHaveBeenCalledOnce();
    }

    rerender(
      <QuickEditorActionsMenu
        isOutlineOpen
        isOutlineDisabled={false}
        {...handlers}
      />,
    );
    await user.click(trigger);
    expect(
      screen.getByRole("menuitem", { name: "编辑模式切换" }),
    ).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "隐藏大纲" })).toBeVisible();
  });

  it("disables the outline action while the editor is collapsed", async () => {
    const onToggleOutline = vi.fn();
    render(
      <QuickEditorActionsMenu
        isOutlineOpen={false}
        isOutlineDisabled
        onToggleEditorMode={vi.fn()}
        onToggleOutline={onToggleOutline}
        onNewWindow={vi.fn()}
        onReturnToApplication={vi.fn()}
        onCloseWindow={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "更多操作" }));
    const outlineItem = screen.getByRole("menuitem", { name: "显示大纲" });
    expect(outlineItem).toHaveAttribute("data-disabled");
    await user.click(outlineItem);
    expect(onToggleOutline).not.toHaveBeenCalled();
  });

  it("shows and forwards Git actions for a linked repository file", async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn();
    const onDiscard = vi.fn();
    render(
      <QuickEditorActionsMenu
        isOutlineOpen={false}
        isOutlineDisabled={false}
        onToggleEditorMode={vi.fn()}
        onToggleOutline={vi.fn()}
        onNewWindow={vi.fn()}
        onReturnToApplication={vi.fn()}
        onCloseWindow={vi.fn()}
        onCompare={onCompare}
        onDiscard={onDiscard}
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "比较差异" }));
    expect(onCompare).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "放弃更改" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
