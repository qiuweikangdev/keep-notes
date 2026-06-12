interface DragTypes {
  includes(type: string): boolean;
}

export function isEditorFileDrag(types: DragTypes): boolean {
  return (
    types.includes("application/x-keep-notes-file") || types.includes("Files")
  );
}
