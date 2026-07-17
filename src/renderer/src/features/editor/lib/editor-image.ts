const IMAGE_FILE_EXTENSION_PATTERN =
  /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/iu;

export interface UploadedImageCursorEditor {
  document: Array<{ id: string; type: string }>;
  getBlock: (blockId: string) => { id: string; type: string } | undefined;
  insertBlocks: (
    blocksToInsert: Array<{ type: "paragraph"; content: string }>,
    referenceBlock: string,
    placement: "after",
  ) => Array<{ id: string }>;
  setTextCursorPosition: (blockId: string, placement: "start") => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;

  return IMAGE_FILE_EXTENSION_PATTERN.test(file.name);
}

function readFileAsArrayBuffer(file: File) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new Error("Failed to read image file as an ArrayBuffer"));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image file"));
    });
    reader.readAsArrayBuffer(file);
  });
}

export async function readImageFileAsArrayBuffer(file: File) {
  if (!isImageFile(file)) return null;

  return readFileAsArrayBuffer(file);
}

export async function readImageFileAsDataUrl(file: File) {
  if (!isImageFile(file)) return null;

  const mime = file.type || "image/png";
  const buffer = await readFileAsArrayBuffer(file);

  // 粘贴截图没有稳定的磁盘路径，转成 data URL 后才能被 Markdown 图片块直接展示和保存。
  return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
}

export function moveCursorAfterUploadedImage(
  editor: UploadedImageCursorEditor | null,
  blockId: string | undefined,
): boolean {
  if (!editor || !blockId) return false;

  const uploadedBlock = editor.getBlock(blockId);
  if (uploadedBlock?.type !== "image") return false;

  const blockIndex = editor.document.findIndex((block) => block.id === blockId);
  const nextBlock = blockIndex >= 0 ? editor.document[blockIndex + 1] : null;
  const targetBlock =
    nextBlock?.type === "paragraph"
      ? nextBlock
      : editor.insertBlocks(
          [{ type: "paragraph", content: "" }],
          blockId,
          "after",
        )[0];

  if (!targetBlock?.id) return false;

  // 粘贴图片后把光标移到图片后的文本块，避免图片块保持选中并立即弹出文件操作栏。
  editor.setTextCursorPosition(targetBlock.id, "start");
  return true;
}
