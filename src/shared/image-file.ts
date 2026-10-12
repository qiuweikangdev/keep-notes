export const IMAGE_MIME_BY_EXTENSION = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function getImageMimeType(filePath: string): string | null {
  const extension = filePath.match(/\.[^./\\]+$/u)?.[0].toLowerCase();
  return extension ? (IMAGE_MIME_BY_EXTENSION.get(extension) ?? null) : null;
}

export function isImageFile(filePath: string): boolean {
  return getImageMimeType(filePath) !== null;
}
