export {
  getDraggedFilePath,
  KEEP_NOTES_FILE_DRAG_TYPE,
  setDraggedFilePath,
  isFileDrag as isEditorFileDrag,
} from "@/lib/file-drag";

const SUPPORTED_EDITOR_FILE_EXTENSIONS = [".md", ".txt"];

export function isSupportedEditorFilePath(filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();
  return SUPPORTED_EDITOR_FILE_EXTENSIONS.some((extension) =>
    normalizedPath.endsWith(extension),
  );
}
