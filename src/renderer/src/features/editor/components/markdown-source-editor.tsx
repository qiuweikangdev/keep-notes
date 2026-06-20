import {
  forwardRef,
  useCallback,
  type ForwardedRef,
  type KeyboardEvent,
} from "react";

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  onScrollTopChange: (scrollTop: number) => void;
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

export const MarkdownSourceEditor = forwardRef<
  HTMLTextAreaElement,
  MarkdownSourceEditorProps
>(function MarkdownSourceEditor(
  { value, onChange, onScrollTopChange, scrollTop = 0 },
  ref,
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
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

      if (event.key !== "Tab") return;
      event.preventDefault();

      const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(nextValue);

      requestAnimationFrame(() => {
        textarea.setSelectionRange(start + 2, start + 2);
      });
    },
    [onChange, value],
  );

  const setTextareaRef = useCallback(
    (element: HTMLTextAreaElement | null) => {
      assignForwardedRef(ref, element);
      if (element && element.scrollTop !== scrollTop) {
        element.scrollTop = scrollTop;
      }
    },
    [ref, scrollTop],
  );

  return (
    <textarea
      aria-label="Markdown 源码"
      className="h-full w-full resize-none bg-[var(--bg-primary)] px-10 py-8 font-mono text-[14px] leading-7 text-[var(--text-primary)] outline-none"
      value={value}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onScroll={(event) => onScrollTopChange(event.currentTarget.scrollTop)}
      ref={setTextareaRef}
    />
  );
});
