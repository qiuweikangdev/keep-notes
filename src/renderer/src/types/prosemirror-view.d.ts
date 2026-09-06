import "@tiptap/pm/view";
import "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { ResolvedPos, Slice } from "@tiptap/pm/model";

// prosemirror-view 导出该剪贴板入口，但未包含在公开声明中；签名与已安装版本保持一致。
declare module "@tiptap/pm/view" {
  export function __parseFromClipboard(
    view: EditorView,
    text: string,
    html: string | null,
    plainText: boolean,
    context: ResolvedPos,
  ): Slice | null;
}

// 插件实例包含运行时生成的 key，历史和选择插件按该值去重。
declare module "@tiptap/pm/state" {
  interface Plugin<PluginState> {
    readonly key: string;
  }
}
