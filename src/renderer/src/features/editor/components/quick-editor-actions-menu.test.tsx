import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickEditorActionsMenu } from "./quick-editor-actions-menu";

describe("quick editor actions menu", () => {
  it("uses one trigger and exposes uniformly styled actions", async () => {
    const handlers = {
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
    await userEvent.setup().click(screen.getByRole("button", { name: "更多操作" }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "显示大纲",
      "新建浮动窗口",
      "返回主窗口",
      "关闭浮动窗口",
    ]);
    expect(screen.queryByText(/Ctrl|Cmd|Shift/)).not.toBeInTheDocument();
    expect(new Set(items.map((item) => item.className)).size).toBe(1);
  });
});
