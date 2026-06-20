import { createElement } from "react";
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  type CodeBlockOptions,
} from "@blocknote/core";
import {
  createCodeBlockConfig,
  createCodeBlockSpec,
} from "@blocknote/core/blocks";
import { createReactBlockSpec } from "@blocknote/react";
import { createHighlighter, createJavaScriptRegexEngine } from "shiki";

import { EditorCodeBlock } from "../components/editor-code-block";
import { CODE_BLOCK_LANGUAGE_OPTIONS } from "./editor-code-block-languages";

export const editorCodeBlockThemes = ["one-light", "one-dark-pro"] as const;
type EditorCodeBlockTheme = (typeof editorCodeBlockThemes)[number];
export const editorCodeBlockPreloadedLanguages =
  CODE_BLOCK_LANGUAGE_OPTIONS.filter((language) => language.id !== "text").map(
    (language) => language.id,
  );

export const editorCodeBlockSupportedLanguages: NonNullable<
  CodeBlockOptions["supportedLanguages"]
> = Object.fromEntries(
  CODE_BLOCK_LANGUAGE_OPTIONS.map((language) => [
    language.id,
    {
      name: language.label,
      aliases: language.aliases,
    },
  ]),
);

const codeBlockOptions: Partial<CodeBlockOptions> = {
  defaultLanguage: "text",
  supportedLanguages: editorCodeBlockSupportedLanguages,
  createHighlighter: createEditorCodeBlockHighlighter,
};

const baseCodeBlockSpec = createCodeBlockSpec(codeBlockOptions);

function getActiveEditorCodeBlockTheme(): EditorCodeBlockTheme {
  if (typeof document === "undefined") {
    return "one-light";
  }

  const colorScheme = document
    .querySelector(".bn-root")
    ?.getAttribute("data-color-scheme");

  return colorScheme === "dark" ? "one-dark-pro" : "one-light";
}

export async function createEditorCodeBlockHighlighter() {
  const highlighter = await createHighlighter({
    // Electron renderer 的 CSP 不允许 WebAssembly eval，使用 JS 正则引擎避免 Shiki Oniguruma WASM 被拦截。
    engine: createJavaScriptRegexEngine(),
    // 预加载编辑器支持的常用语言，避免已有代码块首次渲染时出现长时间无高亮。
    langs: editorCodeBlockPreloadedLanguages,
    themes: [...editorCodeBlockThemes],
  });

  const codeToTokens: typeof highlighter.codeToTokens = (code, options) =>
    highlighter.codeToTokens(code, {
      ...options,
      // BlockNote/ProseMirror 的 Shiki parser 不会自动传入编辑器主题，这里按当前根节点主题强制选择代码配色。
      theme: getActiveEditorCodeBlockTheme(),
    });

  return new Proxy(highlighter, {
    get(target, property, receiver) {
      if (property === "codeToTokens") {
        return codeToTokens;
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

const editorCodeBlockSpec = createReactBlockSpec(
  createCodeBlockConfig(codeBlockOptions),
  {
    ...baseCodeBlockSpec.implementation,
    render: EditorCodeBlock,
    toExternalHTML: ({ block, contentRef }) => {
      const language = block.props.language || "text";

      return createElement(
        "pre",
        null,
        createElement("code", {
          ref: contentRef,
          className: `language-${language}`,
          "data-language": language,
        }),
      );
    },
  },
  baseCodeBlockSpec.extensions,
)();

export const editorBlockSpecs = {
  ...defaultBlockSpecs,
  codeBlock: editorCodeBlockSpec,
};

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: editorBlockSpecs,
});
