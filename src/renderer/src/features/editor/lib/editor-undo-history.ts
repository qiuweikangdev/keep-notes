import type { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { history } from "@tiptap/pm/history";

export const RICH_TEXT_UNDO_HISTORY_DEPTH = 10_000;

interface HistoryPluginConfig {
  config?: {
    depth?: number;
  };
}

export function configureRichTextUndoHistory(
  editor: CoreBlockNoteEditor,
): boolean {
  const state = editor.prosemirrorState;
  const extendedHistory = history({ depth: RICH_TEXT_UNDO_HISTORY_DEPTH });
  const currentHistoryIndex = state.plugins.findIndex(
    (plugin) => plugin.key === extendedHistory.key,
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
