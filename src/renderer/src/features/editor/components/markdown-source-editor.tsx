import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type KeyboardEvent,
} from "react";

interface MarkdownSourceEditorProps {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  style?: CSSProperties;
  value: string;
  onChange: (value: string) => void;
  onScrollTopChange: (scrollTop: number) => void;
  resetKey?: string | null;
  scrollTop?: number;
}

interface MarkdownHeadingShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

interface MarkdownHeadingShortcutResult {
  nextSelectionEnd: number;
  nextSelectionStart: number;
  nextValue: string;
}

function getHeadingShortcutLevel(event: MarkdownHeadingShortcutEvent) {
  if (event.altKey || event.shiftKey) return null;
  if (!event.metaKey && !event.ctrlKey) return null;

  const level = Number(event.key);
  if (!Number.isInteger(level) || level < 1 || level > 6) return null;

  return level;
}

export function applyMarkdownHeadingShortcut(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  level: number,
): MarkdownHeadingShortcutResult {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextLineBreak = value.indexOf("\n", selectionStart);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const line = value.slice(lineStart, lineEnd);
  const headingMatch = line.match(/^( {0,3})(#{1,6})(?:[ \t]+|$)/);
  const leadingSpaces = headingMatch?.[1] ?? line.match(/^ {0,3}/)?.[0] ?? "";
  // 只替换当前行的标题标记，正文和其他行保持原样。
  const oldPrefixLength = headingMatch
    ? headingMatch[0].length
    : leadingSpaces.length;
  const newPrefixLength = leadingSpaces.length + level + 1;
  const nextLine = `${leadingSpaces}${"#".repeat(level)} ${line.slice(
    oldPrefixLength,
  )}`;
  const lineLengthDelta = nextLine.length - line.length;
  const contentOffsetDelta = newPrefixLength - oldPrefixLength;
  const lineContentStart = lineStart + oldPrefixLength;

  const adjustSelection = (position: number) => {
    if (position <= lineContentStart) {
      return lineStart + newPrefixLength;
    }
    if (position <= lineEnd) {
      return position + contentOffsetDelta;
    }
    return position + lineLengthDelta;
  };

  return {
    nextSelectionEnd: adjustSelection(selectionEnd),
    nextSelectionStart: adjustSelection(selectionStart),
    nextValue: `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`,
  };
}

function assignForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) {
    ref.current = value;
  }
}

export function indentMarkdownSelection(
  value: string,
  start: number,
  end: number,
  outdent: boolean,
) {
  if (start === end && !outdent) {
    return {
      value: `${value.slice(0, start)}  ${value.slice(end)}`,
      start: start + 2,
      end: end + 2,
    };
  }

  // 选区末端位于下一行行首时，该行不参与缩进；所有正文必须原样保留。
  const firstLine = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const lastPosition = end > start ? end - 1 : end;
  const nextBreak = value.indexOf("\n", lastPosition);
  const lastLine = nextBreak < 0 ? value.length : nextBreak;
  let offset = firstLine;
  let nextStart = start;
  let nextEnd = end;
  const lines = value
    .slice(firstLine, lastLine)
    .split("\n")
    .map((line) => {
      const removed = outdent
        ? (line.match(/^(?:\t| {1,2})/)?.[0].length ?? 0)
        : 0;
      const delta = outdent ? -removed : 2;
      const mapPosition = (position: number) =>
        position < offset
          ? 0
          : outdent
            ? -Math.min(removed, position - offset)
            : delta;
      nextStart += mapPosition(start);
      nextEnd += mapPosition(end);
      offset += line.length + 1;
      return outdent ? line.slice(removed) : `  ${line}`;
    });
  return {
    value: value.slice(0, firstLine) + lines.join("\n") + value.slice(lastLine),
    start: nextStart,
    end: nextEnd,
  };
}

export const MarkdownSourceEditor = forwardRef<
  HTMLTextAreaElement,
  MarkdownSourceEditorProps
>(function MarkdownSourceEditor(
  {
    fontFamily,
    fontSize,
    lineHeight,
    style,
    value,
    onChange,
    onScrollTopChange,
    resetKey = null,
    scrollTop = 0,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const headingLevel = getHeadingShortcutLevel(event);
      if (headingLevel !== null) {
        event.preventDefault();
        event.stopPropagation();

        const result = applyMarkdownHeadingShortcut(
          value,
          start,
          end,
          headingLevel,
        );
        onChange(result.nextValue);

        requestAnimationFrame(() => {
          textarea.setSelectionRange(
            result.nextSelectionStart,
            result.nextSelectionEnd,
          );
        });
        return;
      }

      if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey)
        return;
      event.preventDefault();
      const result = indentMarkdownSelection(value, start, end, event.shiftKey);
      onChange(result.value);

      requestAnimationFrame(() => {
        textarea.setSelectionRange(result.start, result.end);
      });
    },
    [onChange, value],
  );

  const setTextareaRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      textareaRef.current = element;
      assignForwardedRef(ref, element);
      if (element && element.scrollTop !== scrollTop) {
        element.scrollTop = scrollTop;
      }
    },
    [ref, scrollTop],
  );

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    // 文件切换时源码编辑器必须同步回到顶部，避免先显示旧滚动位置再慢慢回弹。
    element.scrollTop = 0;
  }, [resetKey]);

  const editorStyle: CSSProperties = {
    fontFamily,
    fontSize: fontSize ? `${fontSize}px` : undefined,
    lineHeight,
  };

  return (
    <textarea
      key={resetKey ?? undefined}
      aria-label="Markdown 源码"
      className="h-full w-full resize-none bg-[var(--bg-primary)] px-10 py-8 font-mono text-[14px] leading-7 text-[var(--text-primary)] outline-none"
      style={{ ...editorStyle, ...style }}
      value={value}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onScroll={(event) => onScrollTopChange(event.currentTarget.scrollTop)}
      ref={setTextareaRef}
    />
  );
});
