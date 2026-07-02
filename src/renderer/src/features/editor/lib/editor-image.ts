const IMAGE_FILE_EXTENSION_PATTERN =
  /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/iu;

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
