import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FindWidget } from "./find-widget";

describe("FindWidget", () => {
  it("navigates matches and exposes replace actions", async () => {
    const user = userEvent.setup();
    const onStep = vi.fn();
    const onToggleReplace = vi.fn();
    const onReplaceCurrent = vi.fn();
    const onReplaceAll = vi.fn();
    const onSelectAllMatches = vi.fn();
    const onUndoReplace = vi.fn();

    const { rerender } = render(
      <FindWidget
        isOpen
        isReplaceOpen={false}
        query="note"
        replacement=""
        activeIndex={1}
        matchCount={3}
        options={{}}
        onQueryChange={vi.fn()}
        onReplacementChange={vi.fn()}
        onStep={onStep}
        onClose={vi.fn()}
        onToggleReplace={onToggleReplace}
        onOptionsChange={vi.fn()}
        onReplaceCurrent={onReplaceCurrent}
        onReplaceAll={onReplaceAll}
        onSelectAllMatches={onSelectAllMatches}
        onUndoReplace={onUndoReplace}
      />,
    );

    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下一个匹配" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "全选匹配" }),
    ).not.toHaveAttribute("data-tooltip");
    expect(screen.getByRole("button", { name: "关闭搜索" })).toBeEnabled();

    const searchInput = screen.getByPlaceholderText("查找");
    await user.click(searchInput);
    await user.keyboard("{Enter}");
    expect(onStep).toHaveBeenLastCalledWith(1);

    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onStep).toHaveBeenLastCalledWith(-1);

    await user.keyboard("{Meta>}z{/Meta}");
    expect(onUndoReplace).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "全选匹配" }));
    expect(onSelectAllMatches).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "展开替换" }));
    expect(onToggleReplace).toHaveBeenCalled();
    rerender(
      <FindWidget
        isOpen
        isReplaceOpen
        query="note"
        replacement=""
        activeIndex={1}
        matchCount={3}
        options={{}}
        onQueryChange={vi.fn()}
        onReplacementChange={vi.fn()}
        onStep={onStep}
        onClose={vi.fn()}
        onToggleReplace={onToggleReplace}
        onOptionsChange={vi.fn()}
        onReplaceCurrent={onReplaceCurrent}
        onReplaceAll={onReplaceAll}
        onSelectAllMatches={onSelectAllMatches}
        onUndoReplace={onUndoReplace}
      />,
    );

    await user.click(screen.getByRole("button", { name: "替换当前匹配" }));
    expect(onReplaceCurrent).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "替换全部匹配" }));
    expect(onReplaceAll).toHaveBeenCalled();
  });
});
