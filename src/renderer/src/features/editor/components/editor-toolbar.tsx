import { Code2, FileText, RotateCcw } from "lucide-react";

import type { EditorMode, EditorSaveStatus } from "@/store/editor.store";

interface EditorToolbarProps {
  fileName: string;
  mode: EditorMode;
  saveStatus: EditorSaveStatus;
  onModeChange: (mode: EditorMode) => void;
  onRetrySave: () => void;
}

export function EditorToolbar({
  fileName,
  mode,
  saveStatus,
  onModeChange,
  onRetrySave,
}: EditorToolbarProps) {
  const saveLabel = {
    clean: "已保存",
    dirty: "等待保存",
    saving: "正在保存",
    error: "保存失败",
  }[saveStatus];

  return (
    <div className="flex h-10 items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-3">
      <div className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
        {fileName}
      </div>
      <div className="flex rounded-md bg-[var(--bg-tertiary)] p-0.5">
        <ModeButton
          active={mode === "rich"}
          icon={<FileText className="h-3.5 w-3.5" />}
          onClick={() => onModeChange("rich")}
        >
          富文本
        </ModeButton>
        <ModeButton
          active={mode === "source"}
          icon={<Code2 className="h-3.5 w-3.5" />}
          onClick={() => onModeChange("source")}
        >
          源码
        </ModeButton>
      </div>
      <span
        className="w-16 text-right text-[11px]"
        role="status"
        aria-live="polite"
        style={{
          color:
            saveStatus === "error"
              ? "var(--danger-color, #dc2626)"
              : "var(--text-muted)",
        }}
      >
        {saveLabel}
      </span>
      {saveStatus === "error" ? (
        <button
          type="button"
          className="rounded p-1 text-[var(--text-muted)]"
          aria-label="重试保存"
          onClick={onRetrySave}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px]"
      aria-pressed={active}
      style={{
        backgroundColor: active ? "var(--bg-primary)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.08)" : "none",
      }}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
