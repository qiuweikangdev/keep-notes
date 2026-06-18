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
  createHighlighter: () =>
    createHighlighter({
      langs: CODE_BLOCK_LANGUAGE_OPTIONS.map((language) => language.id),
      themes: ["github-dark", "github-light"],
    }),
};

const baseCodeBlockSpec = createCodeBlockSpec(codeBlockOptions);

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
