import { useState, useCallback, useEffect, useRef } from "react";
import {
  useShortcutsStore,
  type ShortcutAction,
  type ShortcutConfig,
} from "@/store/shortcuts.store";
import { Search, Trash2, RotateCcw } from "lucide-react";

/**
 * 将内部快捷键表示转换为用户可读的显示格式
 * 例如 "CmdOrCtrl+N" -> "Ctrl+N" (非 macOS) 或 "⌘N" (macOS)
 */
function formatKeys(keys: string[]): string {
  if (keys.length === 0) return "未指定";
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  return keys
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
  // 忽略单独的修饰键
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrCtrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  // 映射特殊键名
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
  else return null; // 忽略未知功能键

  // 如果只有修饰键，不生成快捷键
  if (parts.length === 0) return null;

  parts.push(keyName);
  return parts.join("+");
}

/** 单个快捷键行的按键绑定显示/编辑组件 */
function KeyBindingCell({
  shortcut,
  onUpdateKeys,
}: {
  shortcut: ShortcutConfig;
  onUpdateKeys: (keys: string[]) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempKeys, setTempKeys] = useState<string[]>([]);
  const inputRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = () => {
    setTempKeys([]);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setTempKeys([]);
  };

  const handleSaveEdit = () => {
    if (tempKeys.length > 0) {
      onUpdateKeys(tempKeys);
    }
    setIsEditing(false);
    setTempKeys([]);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape 取消编辑
      if (e.key === "Escape") {
        handleCancelEdit();
        return;
      }

      // Enter 确认
      if (e.key === "Enter") {
        handleSaveEdit();
        return;
      }

      const keyStr = eventToKeyString(e);
      if (keyStr) {
        setTempKeys([keyStr]);
      }
    },
    [onUpdateKeys],
  );

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.addEventListener("keydown", handleKeyDown);
      return () => {
        inputRef.current?.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isEditing, handleKeyDown]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <div
          ref={inputRef}
          tabIndex={0}
          className="flex items-center justify-center min-w-[120px] h-7 px-3 rounded-md text-xs cursor-text"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--accent-color)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        >
          {tempKeys.length > 0 ? (
            formatKeys(tempKeys)
          ) : (
            <span style={{ color: "var(--text-muted)" }}>按下快捷键...</span>
          )}
        </div>
        <button
          onClick={handleSaveEdit}
          className="text-xs px-2 py-1 rounded-md transition-all"
          style={{
            backgroundColor: "var(--accent-color)",
            color: "white",
          }}
        >
          确定
        </button>
        <button
          onClick={handleCancelEdit}
          className="text-xs px-2 py-1 rounded-md transition-all"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-muted)",
          }}
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleStartEdit}
      className="flex items-center gap-2 group cursor-pointer"
      title="点击修改快捷键"
    >
      {shortcut.keys.length > 0 ? (
        shortcut.keys.map((keyCombo, idx) => (
          <span
            key={idx}
            className="inline-flex items-center h-7 px-2.5 rounded-md text-xs transition-all"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
            }}
          >
            {formatKeys([keyCombo])}
          </span>
        ))
      ) : (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          未指定
        </span>
      )}
    </button>
  );
}

/** 快捷键配置面板 */
export function ShortcutsSettings() {
  const { shortcuts, updateShortcutKeys, resetShortcut, resetAllShortcuts } =
    useShortcutsStore();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredShortcuts = shortcuts.filter(
    (s) =>
      s.name.includes(searchQuery) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleUpdateKeys = useCallback(
    (id: ShortcutAction, keys: string[]) => {
      updateShortcutKeys(id, keys);
    },
    [updateShortcutKeys],
  );

  const handleClearKeys = useCallback(
    (id: ShortcutAction) => {
      updateShortcutKeys(id, []);
    },
    [updateShortcutKeys],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          键盘快捷键
        </h2>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          placeholder="搜索快捷键"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-4 rounded-lg text-sm"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
      </div>

      {/* 表头 */}
      <div
        className="grid grid-cols-[1fr_200px_40px] items-center px-4 py-2 text-xs"
        style={{
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <span>命令</span>
        <span>按键绑定</span>
        <span />
      </div>

      {/* 快捷键列表 */}
      <div className="space-y-0">
        {filteredShortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className="grid grid-cols-[1fr_200px_40px] items-center px-4 py-3 transition-all"
            style={{
              borderBottom: "1px solid var(--border-color)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {/* 命令名称和描述 */}
            <div className="flex flex-col gap-0.5">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {shortcut.name}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {shortcut.description}
              </span>
            </div>

            {/* 按键绑定 */}
            <KeyBindingCell
              shortcut={shortcut}
              onUpdateKeys={(keys) => handleUpdateKeys(shortcut.id, keys)}
            />

            {/* 操作按钮 */}
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => resetShortcut(shortcut.id)}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
                title="恢复默认"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleClearKeys(shortcut.id)}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#ff4d4f";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
                title="删除快捷键"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 底部：重置全部 */}
      <div className="flex justify-end pt-2">
        <button
          onClick={resetAllShortcuts}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-all"
          style={{
            color: "var(--text-muted)",
            border: "1px solid var(--border-color)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--hover-bg)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
        >
          <RotateCcw className="h-3 w-3" />
          重置全部
        </button>
      </div>
    </div>
  );
}
