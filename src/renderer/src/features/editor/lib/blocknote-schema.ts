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
    // Shiki 语言由 BlockNote 高亮插件按当前代码块语言懒加载，避免首个代码块预加载整个常用语言集。
    langs: [],
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
