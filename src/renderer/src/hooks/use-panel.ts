import { useState, useCallback, useEffect } from "react";
import { useUIStore } from "@/store/ui.store";

export function usePanel() {
  const { panelSize, setPanelSize } = useUIStore();
  const [collapsed, setCollapsed] = useState(false);
  const [previousSize, setPreviousSize] = useState(panelSize);

  useEffect(() => {
    if (panelSize === 0 || panelSize <= 10) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
  }, [panelSize]);

  const toggleCollapse = useCallback(() => {
    if (collapsed) {
      setPanelSize(previousSize || 25);
    } else {
      setPreviousSize(panelSize);
      setPanelSize(0);
    }
    setCollapsed(!collapsed);
  }, [collapsed, panelSize, previousSize, setPanelSize]);

  const handleResize = useCallback(
    (size: number) => {
      setPanelSize(size);
    },
    [setPanelSize],
  );

  return {
    panelSize,
    collapsed,
    toggleCollapse,
    handleResize,
  };
}
