import { useCallback, type KeyboardEvent } from "react";

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  onScrollTopChange: (scrollTop: number) => void;
  scrollTop?: number;
}

export function MarkdownSourceEditor({
  value,
  onChange,
  onScrollTopChange,
  scrollTop = 0,
}: MarkdownSourceEditorProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Tab") return;
      event.preventDefault();

      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(nextValue);

      requestAnimationFrame(() => {
        textarea.setSelectionRange(start + 2, start + 2);
      });
    },
    [onChange, value],
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
      ref={(element) => {
        if (element && element.scrollTop !== scrollTop) {
          element.scrollTop = scrollTop;
        }
      }}
    />
  );
}
