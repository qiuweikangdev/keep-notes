import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  List,
  Replace,
  ReplaceAll,
  X,
} from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";
import type { FindTextOptions } from "../lib/find-in-file";

interface FindWidgetProps {
  isOpen: boolean;
  focusRequestKey: number;
  isReplaceOpen: boolean;
  query: string;
  replacement: string;
  activeIndex: number;
  matchCount: number;
  options: FindTextOptions;
  portalAnchor?: HTMLElement | null;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
  onToggleReplace: () => void;
  onOptionsChange: (options: FindTextOptions) => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
  onSelectAllMatches: () => void;
  onUndoReplace: () => void;
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  isPressed?: boolean;
}

interface FindWidgetPosition {
  top: number;
  right: number;
  maxWidth: number;
}

function getFindWidgetPosition(anchor: HTMLElement): FindWidgetPosition {
  const bounds = anchor.getBoundingClientRect();
  return {
    top: bounds.top + 8,
    right: Math.max(8, window.innerWidth - bounds.right + 8),
    maxWidth: Math.max(0, bounds.width - 16),
  };
}

function IconButton({
  label,
  children,
  className = "",
  isPressed,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={isPressed}
          className={`flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:z-[61] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)] disabled:opacity-40 ${isPressed ? "bg-[var(--button-active-bg)] text-[var(--text-primary)]" : ""} ${className}`}
          {...props}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md border"
          side="bottom"
          sideOffset={5}
          style={{ borderColor: "var(--border-color)" }}
        >
          {label}
          <Tooltip.Arrow className="fill-popover" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function ToggleReplaceButton({
  isReplaceOpen,
  onToggleReplace,
}: {
  isReplaceOpen: boolean;
  onToggleReplace: () => void;
}) {
  const label = isReplaceOpen ? "收起替换" : "展开替换";
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex w-7 shrink-0 items-center justify-center rounded-l-md border-r border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={onToggleReplace}
        >
          {isReplaceOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md border"
          side="bottom"
          sideOffset={5}
          style={{ borderColor: "var(--border-color)" }}
        >
          {label}
          <Tooltip.Arrow className="fill-popover" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function FindWidget({
  isOpen,
  focusRequestKey,
  isReplaceOpen,
  query,
  replacement,
  activeIndex,
  matchCount,
  options,
  portalAnchor,
  onQueryChange,
  onReplacementChange,
  onStep,
  onClose,
  onToggleReplace,
  onOptionsChange,
  onReplaceCurrent,
  onReplaceAll,
  onSelectAllMatches,
  onUndoReplace,
}: FindWidgetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [portalPosition, setPortalPosition] =
    useState<FindWidgetPosition | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [focusRequestKey, isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !portalAnchor) return;

    // 主窗口通过 Portal 脱离透明父层后，持续同步所属编辑器面板的视口位置。
    const updatePosition = () => {
      setPortalPosition(getFindWidgetPosition(portalAnchor));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);

    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", updatePosition);
    }

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(portalAnchor);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, portalAnchor]);

  if (!isOpen) return null;

  const resultText = query
    ? matchCount > 0
      ? `${activeIndex + 1}/${matchCount}`
      : "无结果"
    : "";

  const updateOption = (key: keyof FindTextOptions) => {
    onOptionsChange({ ...options, [key]: !options[key] });
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const handleWidgetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      onUndoReplace();
    }
  };

  const portalStyle: CSSProperties | undefined = portalAnchor
    ? portalPosition
      ? {
          top: portalPosition.top,
          right: portalPosition.right,
          maxWidth: portalPosition.maxWidth,
        }
      : { visibility: "hidden" }
    : undefined;

  const widget = (
    <Tooltip.Provider delayDuration={200}>
      <div
        data-editor-find-ignore
        role="search"
        aria-label="文件内搜索与替换"
        className={`${portalAnchor ? "fixed" : "absolute right-2 top-2"} z-50 flex w-[492px] max-w-[calc(100%-16px)] overflow-visible rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl`}
        style={portalStyle}
        onKeyDown={handleWidgetKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ToggleReplaceButton
          isReplaceOpen={isReplaceOpen}
          onToggleReplace={onToggleReplace}
        />

        <div className="min-w-0 flex-1 py-1">
          <div className="flex h-7 items-center gap-1 px-1">
            <input
              ref={inputRef}
              value={query}
              placeholder="查找"
              className="h-6 min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-color)]"
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <div className="flex items-center rounded bg-[var(--bg-primary)] text-[var(--text-secondary)]">
              <IconButton
                label="区分大小写"
                isPressed={Boolean(options.matchCase)}
                onClick={() => updateOption("matchCase")}
              >
                Aa
              </IconButton>
              <IconButton
                label="全字匹配"
                isPressed={Boolean(options.wholeWord)}
                onClick={() => updateOption("wholeWord")}
              >
                ab
              </IconButton>
              <IconButton
                label="使用正则表达式"
                isPressed={Boolean(options.useRegex)}
                onClick={() => updateOption("useRegex")}
              >
                .*
              </IconButton>
            </div>
            <span className="w-11 shrink-0 text-xs text-[var(--text-secondary)]">
              {resultText}
            </span>
            <IconButton
              label="上一个匹配"
              disabled={matchCount === 0}
              onClick={() => onStep(-1)}
            >
              ↑
            </IconButton>
            <IconButton
              label="下一个匹配"
              disabled={matchCount === 0}
              onClick={() => onStep(1)}
            >
              ↓
            </IconButton>
            <IconButton
              label="全选匹配"
              disabled={matchCount === 0}
              onClick={onSelectAllMatches}
            >
              <List className="h-4 w-4" />
            </IconButton>
            <IconButton label="关闭搜索" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          {isReplaceOpen ? (
            <div className="mt-0.5 flex h-7 items-center gap-1 px-1">
              <input
                value={replacement}
                placeholder="替换"
                className="h-6 min-w-0 flex-1 rounded border border-transparent bg-[var(--bg-primary)] px-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-color)]"
                onChange={(event) => onReplacementChange(event.target.value)}
              />
              <div className="flex w-[172px] items-center gap-1">
                <IconButton
                  label="替换当前匹配"
                  disabled={matchCount === 0}
                  onClick={onReplaceCurrent}
                >
                  <Replace className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="替换全部匹配"
                  disabled={matchCount === 0}
                  onClick={onReplaceAll}
                >
                  <ReplaceAll className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Tooltip.Provider>
  );

  return portalAnchor ? createPortal(widget, document.body) : widget;
}
