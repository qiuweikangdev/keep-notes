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
import { createHighlighter } from "shiki";

import { EditorCodeBlock } from "../components/editor-code-block";
import { CODE_BLOCK_LANGUAGE_OPTIONS } from "./editor-code-block-languages";

export const editorCodeBlockThemes = ["github-dark", "github-light"] as const;
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

export function createEditorCodeBlockHighlighter() {
  return createHighlighter({
    // 预加载编辑器支持的常用语言，避免已有代码块首次渲染时出现长时间无高亮。
    langs: editorCodeBlockPreloadedLanguages,
    themes: [...editorCodeBlockThemes],
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
