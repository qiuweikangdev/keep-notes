export const KEEP_NOTES_FILE_DRAG_TYPE = "application/x-keep-notes-file";

interface DragTypes {
  includes(type: string): boolean;
}

interface FileDragDataTransfer {
  files?: FileList | File[];
  getData(type: string): string;
}

type FileWithPath = File & {
  path?: string;
};

export function isFileDrag(types: DragTypes): boolean {
  return types.includes(KEEP_NOTES_FILE_DRAG_TYPE) || types.includes("Files");
}

export function setDraggedFilePath(
  dataTransfer: Pick<DataTransfer, "setData">,
  filePath: string,
) {
  dataTransfer.setData(KEEP_NOTES_FILE_DRAG_TYPE, filePath);
}

export function getDraggedFilePath(dataTransfer: FileDragDataTransfer) {
  const internalPath = dataTransfer.getData(KEEP_NOTES_FILE_DRAG_TYPE).trim();
  if (internalPath) return internalPath;

  const [file] = Array.from(dataTransfer.files ?? []);
  return (file as FileWithPath | undefined)?.path ?? "";
}
