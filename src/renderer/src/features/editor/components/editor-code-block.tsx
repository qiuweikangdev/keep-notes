import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefCallback,
} from "react";
import { Check, ChevronDown, Clipboard, Search } from "lucide-react";

import {
  getCodeBlockLanguageLabel,
  getCodeBlockLanguageShortLabel,
  getSupportedCodeBlockLanguageId,
  searchCodeBlockLanguages,
} from "../lib/editor-code-block-languages";

interface EditorCodeBlockBlock {
  id: string;
  props?: {
    language?: string;
  };
}

interface EditorCodeBlockEditor {
  updateBlock: (
    id: string,
    update: {
      props: {
        language: string;
      };
    },
  ) => void;
}

interface EditorCodeBlockProps {
  block: EditorCodeBlockBlock;
  editor: EditorCodeBlockEditor;
  contentRef?: RefCallback<HTMLElement>;
}

export function getCodeBlockLineNumbers(codeText: string): number[] {
  const lineCount = Math.max(1, codeText.split("\n").length);

  return Array.from({ length: lineCount }, (_, index) => index + 1);
}

export function readCodeBlockText(element: HTMLElement | null): string {
  return element?.textContent ?? "";
}

export function EditorCodeBlock({
  block,
  editor,
  contentRef,
}: EditorCodeBlockProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [lineNumbers, setLineNumbers] = useState(() =>
    getCodeBlockLineNumbers(""),
  );
  const [isCopied, setIsCopied] = useState(false);

  const language = getSupportedCodeBlockLanguageId(
    block.props?.language ?? "text",
  );
  const languageLabel = getCodeBlockLanguageLabel(language);
  const languageShortLabel = getCodeBlockLanguageShortLabel(language);
  const languageOptions = useMemo(
    () => searchCodeBlockLanguages(languageQuery),
    [languageQuery],
  );

  const updateLineNumbers = useCallback(() => {
    setLineNumbers(getCodeBlockLineNumbers(readCodeBlockText(codeRef.current)));
  }, []);

  const setCodeElement = useCallback(
    (element: HTMLElement | null) => {
      codeRef.current = element;
      contentRef?.(element);
      updateLineNumbers();
    },
    [contentRef, updateLineNumbers],
  );

  useEffect(() => {
    const codeElement = codeRef.current;
    if (!codeElement || typeof MutationObserver === "undefined") return;

    // 监听 BlockNote 写入的真实文本变化，保证行号与编辑内容同步。
    const observer = new MutationObserver(updateLineNumbers);
    observer.observe(codeElement, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [updateLineNumbers]);

  useEffect(() => {
    if (!isLanguagePickerOpen) return;

    searchInputRef.current?.focus();
  }, [isLanguagePickerOpen]);

  useEffect(() => {
    if (!isCopied) return;

    const timer = window.setTimeout(() => setIsCopied(false), 1200);

    return () => window.clearTimeout(timer);
  }, [isCopied]);

  useEffect(() => {
    if (!isLanguagePickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setIsLanguagePickerOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isLanguagePickerOpen]);

  const handleLanguageSelect = (nextLanguage: string) => {
    editor.updateBlock(block.id, {
      props: { language: nextLanguage },
    });
    setIsLanguagePickerOpen(false);
    setLanguageQuery("");
  };

  const handleCopy = async () => {
    try {
      const writeText = navigator.clipboard?.writeText;
      if (!writeText) return;

      await writeText.call(
        navigator.clipboard,
        readCodeBlockText(codeRef.current),
      );
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="editor-code-block-shell editor-code-block relative rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)]"
    >
      <div
        contentEditable={false}
        className="editor-code-block__toolbar flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-2 py-1"
      >
        <div className="relative">
          <button
            type="button"
            aria-expanded={isLanguagePickerOpen}
            aria-haspopup="dialog"
            aria-label="Change code language"
            className="editor-code-block-language-trigger editor-code-block__language-button inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]"
            onClick={() => setIsLanguagePickerOpen((isOpen) => !isOpen)}
          >
            <span>{languageShortLabel}</span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {isLanguagePickerOpen ? (
            <div
              role="dialog"
              aria-label="Code language"
              className="editor-code-block-language-popover editor-code-block__language-dialog absolute left-0 top-8 z-50 w-64 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] p-2 shadow-xl"
            >
              <label className="editor-code-block__search-label flex h-8 items-center gap-2 rounded border border-[var(--border-color)] px-2 text-[var(--text-muted)]">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label="Search code language"
                  value={languageQuery}
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  placeholder="Search language"
                  onChange={(event) => setLanguageQuery(event.target.value)}
                />
              </label>

              <div
                role="listbox"
                aria-label="Code language options"
                className="editor-code-block__language-options mt-2 max-h-64 overflow-y-auto"
              >
                {languageOptions.map((option) => {
                  const isSelected = option.id === language;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className="editor-code-block__language-option flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--button-hover-bg)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]"
                      onClick={() => handleLanguageSelect(option.id)}
                    >
                      <span>{option.label}</span>
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Copy code"
          className="editor-code-block-copy editor-code-block__copy-button inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]"
          onClick={handleCopy}
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{isCopied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <div className="editor-code-block__body grid grid-cols-[auto_1fr]">
        <div
          contentEditable={false}
          aria-hidden="true"
          className="editor-code-block-gutter editor-code-block__line-gutter select-none border-r border-[var(--border-color)] px-3 py-2 text-right font-mono text-xs leading-6 text-[var(--text-muted)]"
        >
          {lineNumbers.map((lineNumber) => (
            <div key={lineNumber} className="editor-code-block__line-number">
              {lineNumber}
            </div>
          ))}
        </div>

        <pre className="editor-code-block__pre m-0 overflow-x-auto p-2">
          <code
            ref={setCodeElement}
            data-testid="editor-code-block-content"
            data-language={language}
            className={`editor-code-block__content language-${language}`}
            contentEditable
            suppressContentEditableWarning
            aria-label={`${languageLabel} code`}
          />
        </pre>
      </div>
    </div>
  );
}
