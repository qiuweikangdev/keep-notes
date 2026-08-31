export const EDITOR_SERIALIZATION_ERROR_PREFIX = "富文本序列化失败：";

export function formatEditorSerializationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${EDITOR_SERIALIZATION_ERROR_PREFIX}${message}`;
}

export function isEditorSerializationError(message: string | null): boolean {
  return message?.startsWith(EDITOR_SERIALIZATION_ERROR_PREFIX) === true;
}
