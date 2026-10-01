import type { RichEditor as CoreBlockNoteEditor } from "./editor-types";
import { history } from "@tiptap/pm/history";

export const RICH_TEXT_UNDO_HISTORY_DEPTH = 10_000;

interface HistoryPluginConfig {
  config?: {
    depth?: number;
  };
}

export function runWithoutRichTextUndoHistory<T>(
  editor: CoreBlockNoteEditor,
  update: () => T,
): T {
  return editor.transact((transaction) => {
    // 文件初次加载只建立撤销基线，不能成为用户可撤回的一次编辑。
    transaction.setMeta("addToHistory", false);
    return update();
  });
}

export function configureRichTextUndoHistory(
  editor: CoreBlockNoteEditor,
): boolean {
  const state = editor.prosemirrorState;
  const extendedHistory = history({ depth: RICH_TEXT_UNDO_HISTORY_DEPTH });
  const currentHistoryIndex = state.plugins.findIndex(
    (plugin) => plugin.spec.key === extendedHistory.spec.key,
  );

  if (currentHistoryIndex < 0) return false;

  const currentHistory = state.plugins[currentHistoryIndex];
  const currentDepth = (currentHistory.spec as HistoryPluginConfig).config
    ?.depth;
  if (currentDepth === RICH_TEXT_UNDO_HISTORY_DEPTH) return true;

  const plugins = state.plugins.slice();
  plugins[currentHistoryIndex] = extendedHistory;
  editor.prosemirrorView.updateState(state.reconfigure({ plugins }));

  return true;
}

export function resetRichTextUndoHistory(editor: CoreBlockNoteEditor): boolean {
  const state = editor.prosemirrorState;
  const historyKey = history().spec.key;
  const historyIndex = state.plugins.findIndex(
    (plugin) => plugin.spec.key === historyKey,
  );
  if (historyIndex < 0) return false;

  // 同一个浮窗接收新文档时先移除历史状态再恢复插件，保留深度配置和其他插件状态。
  const withoutHistory = state.reconfigure({
    plugins: state.plugins.filter((_plugin, index) => index !== historyIndex),
  });
  editor.prosemirrorView.updateState(
    withoutHistory.reconfigure({ plugins: state.plugins }),
  );
  return true;
}
