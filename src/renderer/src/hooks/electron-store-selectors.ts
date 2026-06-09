import type { useEditorStore } from "../store/editor.store";
import type { useTreeStore } from "../store/tree.store";

type EditorState = ReturnType<typeof useEditorStore.getState>;
type TreeState = ReturnType<typeof useTreeStore.getState>;

export const selectSetTreeData = (state: TreeState) => state.setTreeData;
export const selectSetTreeRoot = (state: TreeState) => state.setTreeRoot;
export const selectAddRecentFolder = (state: TreeState) =>
  state.addRecentFolder;
export const selectAddRecentFile = (state: TreeState) => state.addRecentFile;

export const selectSetContent = (state: EditorState) => state.setContent;
export const selectSetFilePath = (state: EditorState) => state.setFilePath;
export const selectIncrementReloadKey = (state: EditorState) =>
  state.incrementReloadKey;
