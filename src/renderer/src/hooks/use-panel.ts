import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { useUIStore } from "@/store/ui.store";
import type { ImperativePanelHandle, Layout } from "react-resizable-panels";

// 所有触发入口需要操作同一个侧边栏实例，因此这里共享面板句柄。
const sharedPanelRef: MutableRefObject<ImperativePanelHandle | null> = {
  current: null,
};

export function usePanel() {
  const panelSize = useUIStore((state) => state.panelSize);
  const setPanelSize = useUIStore((state) => state.setPanelSize);
  const panelRef = sharedPanelRef;
  const [collapsed, setCollapsed] = useState(false);

  // 拖拽中用 ref 跟踪最新尺寸，避免触发 React 重渲染
  const dragSizeRef = useRef(panelSize);

  const toggleCollapse = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;

    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, []);

  // 拖拽过程中实时更新 ref，不触发任何重渲染
  const handleLayoutChange = useCallback((layout: Layout) => {
    const sidebarSize = layout["sidebar"];
    if (typeof sidebarSize === "number") {
      dragSizeRef.current = sidebarSize;
    }
  }, []);

  // 拖拽结束时一次性持久化到 store
  const handleLayoutChanged = useCallback(
    (layout: Layout) => {
      const sidebarSize = layout["sidebar"];
      if (typeof sidebarSize === "number") {
        setPanelSize(sidebarSize);
      }
    },
    [setPanelSize],
  );

  const handleCollapse = useCallback(() => {
    setCollapsed(true);
  }, []);

  const handleExpand = useCallback(() => {
    setCollapsed(false);
  }, []);

  const handleDidMount = useCallback((panel: ImperativePanelHandle) => {
    if (panel.isCollapsed()) {
      setCollapsed(true);
    }
  }, []);

  return {
    panelSize,
    panelRef,
    collapsed,
    toggleCollapse,
    handleLayoutChange,
    handleLayoutChanged,
    handleCollapse,
    handleExpand,
    handleDidMount,
  };
}
