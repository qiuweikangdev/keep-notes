import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  useShortcutsStore,
  type ShortcutAction,
  type ShortcutConfig,
} from "@/store/shortcuts.store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Search,
  Trash2,
  RotateCcw,
  X,
  AlertTriangle,
  KeyboardIcon,
  Pencil,
} from "lucide-react";

/**
 * 将内部快捷键表示转换为用户可读的显示格式
 * 例如 "CmdOrCtrl+N" -> "Ctrl+N" (非 macOS) 或 "⌘N" (macOS)
 * 只显示当前平台对应的快捷键
 */
function formatKeys(keys: string[]): string {
  if (keys.length === 0) return "未指定";
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  // 根据平台过滤：macOS 只显示含 CmdOrCtrl 的绑定，Windows 过滤同时含 CmdOrCtrl 和 Alt 的绑定
  const filtered = keys.filter((key) => {
    const hasCmdOrCtrl = key.includes("CmdOrCtrl");
    const hasAlt = key.includes("Alt+");
    // 只有同时包含 CmdOrCtrl 和 Alt 的绑定才在 Windows 上过滤
    if (!isMac && hasCmdOrCtrl && hasAlt) return false;
    return true;
  });

  // 如果过滤后没有匹配的，回退显示所有
  const displayKeys = filtered.length > 0 ? filtered : keys;

  return displayKeys
    .map((key) => {
      let display = key;
      if (isMac) {
        display = display
          .replace("CmdOrCtrl+", "⌘")
          .replace("Cmd+", "⌘")
          .replace("Ctrl+", "⌃")
          .replace("Alt+", "⌥")
          .replace("Shift+", "⇧")
          .replace("Mod+", "⌘");
      } else {
        display = display
          .replace("CmdOrCtrl+", "Ctrl+")
          .replace("Cmd+", "Ctrl+")
          .replace("Mod+", "Ctrl+");
      }
      return display;
    })
    .join(" / ");
}

/**
 * 将 KeyboardEvent 转换为内部快捷键字符串
 */
function eventToKeyString(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrCtrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  let keyName = e.key;
  if (keyName === " ") keyName = "Space";
  else if (keyName === "Escape") keyName = "Escape";
  else if (keyName === "Backspace") keyName = "Backspace";
  else if (keyName === "Delete") keyName = "Delete";
  else if (keyName === "Enter") keyName = "Enter";
  else if (keyName === "Tab") keyName = "Tab";
  else if (keyName.startsWith("Arrow")) keyName = keyName;
  else if (keyName === "/") keyName = "/";
  else if (keyName === "\\") keyName = "\\";
  else if (keyName.length === 1) keyName = keyName.toUpperCase();
  else return null;

  if (parts.length === 0) return null;
  parts.push(keyName);
  return parts.join("+");
}

/** 二次确认信息 */
interface ConfirmState {
  open: boolean;
  type: "delete" | "resetAll" | "resetOne" | null;
  shortcutId?: ShortcutAction;
  shortcutName?: string;
  title: string;
  description: string;
  confirmText: string;
}

/** 单个快捷键行的按键绑定显示/编辑组件 */
function KeyBindingCell({
  shortcut,
  onUpdateKeys,
  conflictName,
}: {
  shortcut: ShortcutConfig;
  onUpdateKeys: (keys: string[]) => void;
  /** 与其它快捷键冲突时显示的提示文本 */
  conflictName?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEmpty = () => {
    onUpdateKeys([]);
    setIsEditing(false);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        handleCancelEdit();
        return;
      }

      if (
        (e.key === "Backspace" || e.key === "Delete") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        handleSaveEmpty();
        return;
      }

      const keyStr = eventToKeyString(e);
      // 捕获到有效快捷键后立即保存并退出编辑
      if (keyStr) {
        onUpdateKeys([keyStr]);
        setIsEditing(false);
      }
    },
    [onUpdateKeys],
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      const node = inputRef.current;
      node.addEventListener("keydown", handleKeyDown);
      return () => {
        node.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isEditing, handleKeyDown]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-3 flex-nowrap min-w-0">
        <div
          ref={inputRef}
          tabIndex={0}
          className="flex items-center justify-center h-7 px-3 rounded-md text-xs cursor-text transition-all whitespace-nowrap min-w-[140px] flex-1"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--accent-color)",
            color: "var(--text-primary)",
            outline: "none",
            boxShadow:
              "0 0 0 2px color-mix(in srgb, var(--accent-color) 20%, transparent)",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>按下快捷键</span>
        </div>
        <button
          onClick={handleCancelEdit}
          className="h-7 px-1 text-xs whitespace-nowrap transition-all"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          取消
        </button>
      </div>
    );
  }

  const hasKeys = shortcut.keys.length > 0;

  // 根据平台过滤：macOS 只显示含 CmdOrCtrl 的绑定，Windows 只显示不含 CmdOrCtrl 的绑定
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const displayKeys = hasKeys
    ? shortcut.keys.filter((key) => {
        const hasCmdOrCtrl = key.includes("CmdOrCtrl");
        const hasAlt = key.includes("Alt+");
        // 只有同时包含 CmdOrCtrl 和 Alt 的绑定才在 Windows 上过滤
        // 其他绑定（如 CmdOrCtrl+N）在 Windows 上正常显示
        if (!isMac && hasCmdOrCtrl && hasAlt) return false;
        return true;
      })
    : [];
  const hasDisplayKeys = displayKeys.length > 0;

  return (
    <div className="flex items-center gap-1.5 group/cell min-w-0">
      {hasDisplayKeys ? (
        displayKeys.map((keyCombo, idx) => (
          <span
            key={idx}
            className="inline-flex items-center h-7 px-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-all"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.borderColor = "var(--accent-color)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              e.currentTarget.style.borderColor = "var(--border-color)";
            }}
          >
            {formatKeys([keyCombo])}
          </span>
        ))
      ) : (
        <span
          className="inline-flex items-center h-7 px-2.5 rounded-md text-xs whitespace-nowrap transition-all"
          style={{
            backgroundColor: "transparent",
            color: "var(--text-muted)",
            border: "1px dashed var(--border-color)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-color)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-color)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          未指定
        </span>
      )}
      {/* 编辑（铅笔）图标：行悬停时高亮出现 */}
      <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              onClick={handleStartEdit}
              className="flex items-center justify-center w-5 h-5 rounded transition-all opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent-color)";
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              title="录制快捷键"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
              sideOffset={5}
            >
              录制快捷键
              <Tooltip.Arrow className="fill-popover" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
      {conflictName ? (
        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span
                className="inline-flex items-center text-xs flex-shrink-0"
                style={{ color: "#d97706" }}
              >
                <AlertTriangle className="h-3 w-3" />
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
                sideOffset={5}
              >
                与「{conflictName}」冲突
                <Tooltip.Arrow className="fill-popover" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      ) : null}
    </div>
  );
}

/** 行内的操作按钮（带 Tooltip） */
function RowActionButton({
  onClick,
  title,
  hoverColor = "var(--text-primary)",
  hoverBg = "var(--hover-bg)",
  children,
}: {
  onClick: () => void;
  title: string;
  hoverColor?: string;
  hoverBg?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = hoverColor;
              e.currentTarget.style.backgroundColor = hoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md border"
            sideOffset={5}
            style={{ borderColor: "var(--border-color)" }}
          >
            {title}
            <Tooltip.Arrow className="fill-popover" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** 快捷键配置面板 */
export function ShortcutsSettings() {
  const {
    shortcuts,
    defaultShortcuts,
    updateShortcutKeys,
    resetShortcut,
    resetAllShortcuts,
  } = useShortcutsStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    type: null,
    title: "",
    description: "",
    confirmText: "确认",
  });

  const isDefaultBinding = useCallback(
    (shortcut: ShortcutConfig) => {
      const def = defaultShortcuts.find((d) => d.id === shortcut.id);
      if (!def) return false;
      if (def.keys.length !== shortcut.keys.length) return false;
      return def.keys.every((k) => shortcut.keys.includes(k));
    },
    [defaultShortcuts],
  );

  const conflictMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of shortcuts) {
      for (const key of s.keys) {
        const existing = map.get(key);
        if (existing && existing !== s.name) {
          map.set(key, existing);
        } else {
          map.set(key, s.name);
        }
      }
    }
    const result = new Map<string, string>();
    for (const s of shortcuts) {
      for (const key of s.keys) {
        const ownerName = map.get(key);
        if (ownerName && ownerName !== s.name) {
          result.set(`${s.id}:${key}`, ownerName);
        }
      }
    }
    return result;
  }, [shortcuts]);

  const filteredShortcuts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.keys.some((k) => formatKeys([k]).toLowerCase().includes(q)),
    );
  }, [shortcuts, searchQuery]);

  const stats = useMemo(() => {
    const total = shortcuts.length;
    const configured = shortcuts.filter((s) => s.keys.length > 0).length;
    return { total, configured };
  }, [shortcuts]);

  const handleUpdateKeys = useCallback(
    (id: ShortcutAction, keys: string[]) => {
      updateShortcutKeys(id, keys);
    },
    [updateShortcutKeys],
  );

  const requestClearKeys = useCallback((shortcut: ShortcutConfig) => {
    if (shortcut.keys.length === 0) return;
    setConfirmState({
      open: true,
      type: "delete",
      shortcutId: shortcut.id,
      shortcutName: shortcut.name,
      title: "删除快捷键",
      description: `确定要删除「${shortcut.name}」的快捷键绑定吗？删除后该命令将无法通过快捷键触发。`,
      confirmText: "删除",
    });
  }, []);

  const requestResetOne = useCallback(
    (shortcut: ShortcutConfig) => {
      if (isDefaultBinding(shortcut)) return;
      const def = defaultShortcuts.find((d) => d.id === shortcut.id);
      setConfirmState({
        open: true,
        type: "resetOne",
        shortcutId: shortcut.id,
        shortcutName: shortcut.name,
        title: "恢复默认快捷键",
        description: `确定要将「${shortcut.name}」恢复为默认绑定 ${
          def ? formatKeys(def.keys) : "未指定"
        } 吗？`,
        confirmText: "恢复默认",
      });
    },
    [defaultShortcuts, isDefaultBinding],
  );

  const requestResetAll = useCallback(() => {
    setConfirmState({
      open: true,
      type: "resetAll",
      title: "重置全部快捷键",
      description:
        "确定要将所有快捷键恢复为默认设置吗？您自定义的所有绑定都将丢失。",
      confirmText: "全部重置",
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    switch (confirmState.type) {
      case "delete":
        if (confirmState.shortcutId) {
          updateShortcutKeys(confirmState.shortcutId, []);
        }
        break;
      case "resetOne":
        if (confirmState.shortcutId) {
          resetShortcut(confirmState.shortcutId);
        }
        break;
      case "resetAll":
        resetAllShortcuts();
        break;
    }
    setConfirmState((prev) => ({ ...prev, open: false }));
  }, [confirmState, resetShortcut, resetAllShortcuts, updateShortcutKeys]);

  return (
    <div className="space-y-4">
      {/* 标题与说明 */}
      <div>
        <h2
          className="text-base font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <KeyboardIcon className="h-4 w-4" />
          键盘快捷键
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          自定义命令对应的键盘快捷键，点击按键即可重新录制
        </p>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder="搜索快捷键"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-8 pl-9 pr-9 rounded-md text-xs transition-colors focus:border-[var(--accent-color)]"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-muted)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="清空搜索"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {/* 列表容器（包含表头与内容） */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          border: "1px solid var(--border-color)",
          backgroundColor: "var(--bg-primary)",
        }}
      >
        {/* 表头 */}
        <div
          className="grid items-center px-4 py-2 text-xs font-medium"
          style={{
            gridTemplateColumns: "minmax(0, 1fr) 200px 64px",
            color: "var(--text-muted)",
            backgroundColor: "var(--bg-tertiary)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <span>命令</span>
          <span>按键绑定</span>
          <span className="text-right">操作</span>
        </div>

        {/* 快捷键列表 */}
        <div>
          {filteredShortcuts.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              <Search className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">没有找到匹配的快捷键</p>
              <p className="text-xs mt-1">尝试更换搜索关键词</p>
            </div>
          ) : (
            filteredShortcuts.map((shortcut, idx) => {
              const isLast = idx === filteredShortcuts.length - 1;
              const conflictKey = shortcut.keys
                .map((k) => `${shortcut.id}:${k}`)
                .map((k) => conflictMap.get(k))
                .find(Boolean);
              const isDefault = isDefaultBinding(shortcut);

              return (
                <div
                  key={shortcut.id}
                  className="grid items-center px-4 py-2.5 transition-colors group/item"
                  style={{
                    gridTemplateColumns: "minmax(0, 1fr) 200px 64px",
                    borderBottom: isLast
                      ? "none"
                      : "1px solid var(--border-color)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {/* 命令名称和描述 */}
                  <div className="flex flex-col gap-0 min-w-0 pr-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {shortcut.name}
                      </span>
                      {!isDefault ? (
                        <span
                          className="inline-flex items-center h-4 px-1.5 rounded text-[10px] font-medium flex-shrink-0"
                          style={{
                            backgroundColor:
                              "color-mix(in srgb, var(--accent-color) 12%, transparent)",
                            color: "var(--accent-color)",
                          }}
                          title="已自定义"
                        >
                          自定义
                        </span>
                      ) : null}
                    </div>
                    <span
                      className="text-xs truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {shortcut.description}
                    </span>
                  </div>

                  {/* 按键绑定 */}
                  <div className="min-w-0 overflow-hidden">
                    <KeyBindingCell
                      shortcut={shortcut}
                      onUpdateKeys={(keys) =>
                        handleUpdateKeys(shortcut.id, keys)
                      }
                      conflictName={conflictKey}
                    />
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center justify-end gap-0.5">
                    {!isDefault ? (
                      <RowActionButton
                        onClick={() => requestResetOne(shortcut)}
                        title={`重置 ${shortcut.name} 的快捷键`}
                        hoverBg="var(--hover-bg)"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </RowActionButton>
                    ) : null}
                    <RowActionButton
                      onClick={() => requestClearKeys(shortcut)}
                      title={
                        shortcut.keys.length > 0 ? "删除快捷键" : "尚未绑定"
                      }
                      hoverColor="#dc2626"
                      hoverBg="color-mix(in srgb, #dc2626 12%, transparent)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </RowActionButton>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 底部：统计 + 重置全部 */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          已配置 {stats.configured} / {stats.total} 个快捷键
        </span>
        <button
          onClick={requestResetAll}
          className="flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md transition-all whitespace-nowrap"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border-color)",
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--hover-bg)";
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.borderColor = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border-color)";
          }}
        >
          <RotateCcw className="h-3 w-3" />
          重置全部
        </button>
      </div>

      {/* 二次确认对话框 */}
      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
        title={confirmState.title}
        description={confirmState.description}
        confirmText={confirmState.confirmText}
        variant={confirmState.type === "resetAll" ? "danger" : "default"}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
