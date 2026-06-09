import type { EditorMode } from "@/store/editor.store";

export interface EditorParseFallback {
  mode: EditorMode;
  message: string;
}

export function createParseFallback(error: unknown): EditorParseFallback {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    mode: "source",
    message: `富文本解析失败：${detail}`,
  };
}
