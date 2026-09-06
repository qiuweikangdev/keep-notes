import {
  elementScroll,
  observeElementOffset,
  type VirtualizerOptions,
} from "@tanstack/react-virtual";

type TreeVirtualizerOptions = VirtualizerOptions<HTMLDivElement, Element>;

// 每个列表独立保存偏移观察器，避免主窗口与其他树实例之间互相影响。
export function createFileTreeScrollOptions() {
  let updateOffset: ((offset: number, isScrolling: boolean) => void) | null =
    null;

  const observeOffset: TreeVirtualizerOptions["observeElementOffset"] = (
    instance,
    callback,
  ) => {
    updateOffset = callback;
    const unsubscribe = observeElementOffset(instance, callback);
    return () => {
      updateOffset = null;
      unsubscribe?.();
    };
  };

  const scrollToFn: TreeVirtualizerOptions["scrollToFn"] = (
    offset,
    options,
    instance,
  ) => {
    elementScroll(offset, options, instance);
    if (options.behavior === "smooth" || !instance.scrollElement) return;

    // 程序跳转立即同步实际偏移；等待浏览器下一次 scroll 事件会让视口先移到尚未渲染的行。
    // false 让 React 在 layout effect 内完成更新，不在提交阶段嵌套 flushSync。
    updateOffset?.(instance.scrollElement.scrollTop, false);
  };

  return { observeElementOffset: observeOffset, scrollToFn };
}
