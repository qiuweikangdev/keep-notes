import { useLayoutEffect, useMemo } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { afterEach, describe, expect, it } from "vitest";
import { createFileTreeScrollOptions } from "./file-tree-scroll";

afterEach(cleanup);

function createViewport() {
  const viewport = document.createElement("div");
  Object.defineProperties(viewport, {
    offsetWidth: { value: 240 },
    offsetHeight: { value: 280 },
    clientHeight: { value: 280 },
    scrollHeight: { value: 28000 },
  });
  // 浏览器先改变实际位置，稍后才发出 scroll 事件；测试刻意不提前发送事件。
  viewport.scrollTo = (options?: ScrollToOptions | number) => {
    if (typeof options === "object") viewport.scrollTop = options.top ?? 0;
  };
  return viewport;
}

describe("file tree programmatic scroll", () => {
  it("renders distant target rows before the native scroll event arrives", () => {
    const viewport = createViewport();
    const { result, rerender } = renderHook(
      ({ target }) => {
        const scrollOptions = useMemo(createFileTreeScrollOptions, []);
        const virtualizer = useVirtualizer({
          ...scrollOptions,
          count: 1000,
          getScrollElement: () => viewport,
          estimateSize: () => 28,
          overscan: 6,
        });
        useLayoutEffect(() => {
          virtualizer.scrollToIndex(target, { align: "center" });
        }, [target, virtualizer]);
        return virtualizer.getVirtualItems();
      },
      { initialProps: { target: 0 } },
    );

    for (const target of [800, 10, 990, 400]) {
      rerender({ target });
      expect(viewport.scrollTop).toBe(target * 28 - 126);
      expect(result.current.some((row) => row.index === target)).toBe(true);
      expect(result.current.length).toBeLessThan(30);
      const beforeNativeEvent = result.current.map((row) => row.index);
      act(() => viewport.dispatchEvent(new Event("scroll")));
      expect(result.current.map((row) => row.index)).toEqual(beforeNativeEvent);
    }
  });

  it("keeps scroll offsets independent for separate file trees", () => {
    const firstViewport = createViewport();
    const secondViewport = createViewport();
    const { result } = renderHook(() => {
      const firstOptions = useMemo(createFileTreeScrollOptions, []);
      const secondOptions = useMemo(createFileTreeScrollOptions, []);
      const first = useVirtualizer({
        ...firstOptions,
        count: 1000,
        getScrollElement: () => firstViewport,
        estimateSize: () => 28,
      });
      const second = useVirtualizer({
        ...secondOptions,
        count: 1000,
        getScrollElement: () => secondViewport,
        estimateSize: () => 28,
      });
      return { first, second };
    });
    act(() => result.current.first.scrollToIndex(800, { align: "center" }));
    expect(
      result.current.first.getVirtualItems().some((row) => row.index === 800),
    ).toBe(true);
    expect(secondViewport.scrollTop).toBe(0);
    expect(result.current.second.getVirtualItems()[0]?.index).toBe(0);
  });
});
