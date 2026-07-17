import { useCallback, useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import type { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { PictureInPicture2, Plus, X } from "lucide-react";
import type { CloseSaveSnapshot } from "@shared/types";
import { useTheme } from "@/hooks/use-theme";
import { useEditorStore } from "@/store/editor.store";
import { editorSchema } from "../lib/blocknote-schema";
import {
  moveCursorAfterUploadedImage,
  readImageFileAsDataUrl,
  type UploadedImageCursorEditor,
} from "../lib/editor-image";
import { serializeMarkdown } from "../lib/markdown";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/styles/blocknote-overrides.css";
import "./quick-editor-window.css";

interface QuickEditorBlock {
  children?: QuickEditorBlock[];
  content?: unknown;
  type: string;
}

interface QuickEditorBridgeWindow extends Window {
  __getNextDirtyEditor?: () => Promise<CloseSaveSnapshot | null>;
  __onCloseSaveSuccess?: (
    groupId: string,
    tabId: string,
    filePath: string | null,
    savedContent: string,
  ) => Promise<void>;
}

const QUICK_EDITOR_GROUP_ID = "quick-editor";
const QUICK_EDITOR_TAB_ID = "quick-editor-draft";

function inlineContentHasText(content: unknown): boolean {
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;

  return content.some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!item || typeof item !== "object") return false;

    const record = item as Record<string, unknown>;
    return (
      inlineContentHasText(record.text) || inlineContentHasText(record.content)
    );
  });
}

export function hasMeaningfulQuickEditorContent(
  blocks: readonly QuickEditorBlock[],
): boolean {
  return blocks.some((block) => {
    if (block.type !== "paragraph") return true;
    if (inlineContentHasText(block.content)) return true;
    return block.children
      ? hasMeaningfulQuickEditorContent(block.children)
      : false;
  });
}

export async function uploadQuickEditorImage(file: File): Promise<string> {
  const dataUrl = await readImageFileAsDataUrl(file);
  if (!dataUrl) {
    throw new Error("Only image files can be uploaded from the editor");
  }

  return dataUrl;
}

export function createQuickEditorImageUploader(
  getEditor: () => UploadedImageCursorEditor | null,
  schedule: (callback: () => void) => unknown,
) {
  return async (file: File, blockId?: string): Promise<string> => {
    const url = await uploadQuickEditorImage(file);
    schedule(() => {
      moveCursorAfterUploadedImage(getEditor(), blockId);
    });
    return url;
  };
}

export function QuickEditorWindow() {
  const appearance = useEditorStore((state) => state.appearance);
  const { isDark } = useTheme({ transparentBackground: true });
  const dirtyRef = useRef(false);
  const returnInProgressRef = useRef(false);
  const editorRef = useRef<CoreBlockNoteEditor | null>(null);
  const handleImageUploadRef = useRef(
    createQuickEditorImageUploader(
      () => editorRef.current,
      (callback) => window.setTimeout(callback, 0),
    ),
  );
  const editor = useCreateBlockNote({
    schema: editorSchema,
    uploadFile: handleImageUploadRef.current,
  });
  editorRef.current = editor;

  const syncDirtyState = useCallback((isDirty: boolean) => {
    dirtyRef.current = isDirty;
    window.electronAPI.updateDirtyState(isDirty);
  }, []);

  useEditorChange(() => {
    syncDirtyState(
      hasMeaningfulQuickEditorContent(
        editor.document as unknown as QuickEditorBlock[],
      ),
    );
  }, editor);

  useEffect(() => {
    const bridgeWindow = window as QuickEditorBridgeWindow;
    syncDirtyState(false);

    bridgeWindow["__getNextDirtyEditor"] = async () => {
      if (!dirtyRef.current) return null;

      const content = await serializeMarkdown(editor, editor.document);
      if (!content.trim()) {
        syncDirtyState(false);
        return null;
      }

      return {
        groupId: QUICK_EDITOR_GROUP_ID,
        tabId: QUICK_EDITOR_TAB_ID,
        content,
        filePath: null,
      };
    };

    bridgeWindow["__onCloseSaveSuccess"] = async (
      _groupId,
      _tabId,
      _filePath,
      savedContent,
    ) => {
      // 写盘期间若又发生编辑，继续保留脏状态并进入下一轮关闭保存检查。
      const currentContent = await serializeMarkdown(editor, editor.document);
      syncDirtyState(currentContent !== savedContent);
    };

    return () => {
      delete bridgeWindow["__getNextDirtyEditor"];
      delete bridgeWindow["__onCloseSaveSuccess"];
      window.electronAPI.updateDirtyState(false);
    };
  }, [editor, syncDirtyState]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => editor.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  const handleReturnToApplication = useCallback(async () => {
    if (returnInProgressRef.current) return;
    returnInProgressRef.current = true;

    try {
      const content = await serializeMarkdown(editor, editor.document);
      window.electronAPI.returnToMainWindowFromQuickEditor(content);
    } catch {
      returnInProgressRef.current = false;
    }
  }, [editor]);

  return (
    <div className="quick-editor-window" data-quick-editor-window="true">
      <header className="quick-editor-window__titlebar">
        <div className="quick-editor-window__drag-region" aria-hidden="true" />
        <div className="quick-editor-window__actions">
          <button
            aria-label="新建浮窗编辑器"
            className="quick-editor-window__action"
            title="新建浮窗编辑器"
            type="button"
            onClick={() => window.electronAPI.createQuickEditorWindow()}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            aria-label="返回应用"
            className="quick-editor-window__action"
            title="返回应用"
            type="button"
            onClick={() => void handleReturnToApplication()}
          >
            <PictureInPicture2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            aria-label="关闭快速编辑"
            className="quick-editor-window__action quick-editor-window__action--close"
            title="关闭"
            type="button"
            onClick={() => window.electronAPI.closeQuickEditorWindow()}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="quick-editor-window__editor" aria-label="快速编辑器">
        <BlockNoteView
          editor={editor}
          theme={isDark ? "dark" : "light"}
          spellCheck={false}
          style={{
            fontSize: `${appearance.fontSize}px`,
            lineHeight: appearance.lineHeight,
          }}
        />
      </main>
    </div>
  );
}
