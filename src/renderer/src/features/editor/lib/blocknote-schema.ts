import {
  BlockNoteSchema,
  createBlockSpec,
  createExtension,
  defaultBlockSpecs,
  type CodeBlockOptions,
} from "@blocknote/core";
import {
  createCodeBlockConfig,
  createCodeBlockSpec,
} from "@blocknote/core/blocks";

import {
  createEditorCodeBlockExternalHTML,
  createEditorCodeBlockNodeView,
} from "./editor-code-block-node-view";
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
};

const baseCodeBlockSpec = createCodeBlockSpec(codeBlockOptions);

const editorCodeBlockExtensions = [
  ...(baseCodeBlockSpec.extensions?.filter(
    (extension) =>
      (extension as { key?: string }).key !== "code-block-highlighter",
  ) ?? []),
  createExtension({
    key: "editor-code-block-backspace",
    keyboardShortcuts: {
      Backspace: ({ editor }) => {
        return editor.transact((tr) => {
          const { block } = editor.getTextCursorPosition();
          if (block.type !== "codeBlock") return false;
          if (tr.selection.$from.parent.textContent) return false;

          // CodeMirror 没有接住事件时，外层仍需能删除空代码块，避免留下 ```language 的壳。
          editor.removeBlocks([block]);

          return true;
        });
      },
    },
  }),
];

const editorCodeBlockSpec = createBlockSpec(
  createCodeBlockConfig(codeBlockOptions),
  {
    ...baseCodeBlockSpec.implementation,
    meta: {
      ...baseCodeBlockSpec.implementation.meta,
    },
    render: createEditorCodeBlockNodeView,
    toExternalHTML: createEditorCodeBlockExternalHTML,
  },
  editorCodeBlockExtensions,
)();

export const editorBlockSpecs = {
  ...defaultBlockSpecs,
  codeBlock: editorCodeBlockSpec,
};

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: editorBlockSpecs,
});
