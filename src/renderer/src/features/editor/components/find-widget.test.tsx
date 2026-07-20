import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FindWidget } from "./find-widget";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FindWidget", () => {
  it("portals an anchored widget outside a translucent ancestor", () => {
    const translucentRoot = document.createElement("div");
    translucentRoot.style.opacity = "0.6";
    const anchor = document.createElement("div");
    translucentRoot.append(anchor);
    document.body.append(translucentRoot);
    let resizeCallback: ResizeObserverCallback | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
    const bounds = vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
      x: 200,
      y: 100,
      top: 100,
      right: 1100,
      bottom: 700,
      left: 200,
      width: 900,
      height: 600,
      toJSON: () => ({}),
    });

    render(
      <FindWidget
        isOpen
        isReplaceOpen={false}
        query="note"
        replacement=""
        activeIndex={0}
        matchCount={1}
        options={{}}
        portalAnchor={anchor}
        onQueryChange={vi.fn()}
        onReplacementChange={vi.fn()}
        onStep={vi.fn()}
        onClose={vi.fn()}
        onToggleReplace={vi.fn()}
        onOptionsChange={vi.fn()}
        onReplaceCurrent={vi.fn()}
        onReplaceAll={vi.fn()}
        onSelectAllMatches={vi.fn()}
        onUndoReplace={vi.fn()}
      />,
      { container: anchor },
    );

    const widget = screen.getByRole("search", {
      name: "文件内搜索与替换",
    });
    expect(translucentRoot).not.toContainElement(widget);
    expect(widget).toHaveClass("fixed");
    expect(widget).toHaveStyle({
      top: "108px",
      right: "108px",
      maxWidth: "884px",
    });

    bounds.mockReturnValue({
      x: 400,
      y: 120,
      top: 120,
      right: 1150,
      bottom: 700,
      left: 400,
      width: 750,
      height: 580,
      toJSON: () => ({}),
    });
    act(() => {
      resizeCallback?.([], {} as ResizeObserver);
    });
    expect(widget).toHaveStyle({
      top: "128px",
      right: "58px",
      maxWidth: "734px",
    });
  });

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
