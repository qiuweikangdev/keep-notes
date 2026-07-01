import {
  BlockNoteSchema,
  createBlockSpec,
  createExtension,
  defaultBlockSpecs,
  getBlockInfo,
  getNodeById,
  insertBlocks,
  type CodeBlockOptions,
} from "@blocknote/core";
import {
  createCodeBlockConfig,
  createCodeBlockSpec,
  createQuoteBlockSpec,
} from "@blocknote/core/blocks";
import { TextSelection } from "@tiptap/pm/state";

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

function getInlineContentText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

// 通过 >  输入规则创建出的空引用块，现在按 Backspace 会直接回退成空的普通段落，不再残留 > 触发文本
function isEmptyQuoteBackspaceContent(content: unknown) {
  const text = getInlineContentText(content).trim();

  return text === "" || text === ">";
}

const baseQuoteBlockSpec = createQuoteBlockSpec();

const editorQuoteBlockSpec = {
  ...baseQuoteBlockSpec,
  config: {
    ...baseQuoteBlockSpec.config,
    meta: {
      // 引用块内按 Enter 继续换行，保持光标留在同一个引用块中。
      hardBreakShortcut: "enter" as const,
    },
  },
  extensions: [
    ...(baseQuoteBlockSpec.extensions ?? []),
    createExtension({
      key: "editor-quote-enter",
      runsBefore: ["default"],
      keyboardShortcuts: {
        Backspace: ({ editor }) => {
          const { block } = editor.getTextCursorPosition();
          const { selection } = editor.prosemirrorState;

          if (block.type !== "quote") return false;
          if (!selection.empty) return false;
          if (!isEmptyQuoteBackspaceContent(block.content)) return false;

          // 空引用块回退为普通段落，同时丢弃输入规则残留的 > 触发文本。
          editor.updateBlock(block, {
            type: "paragraph",
            content: "",
            props: {},
          });

          return true;
        },
        Enter: ({ editor }) => {
          return editor.transact((tr) => {
            const { block } = editor.getTextCursorPosition();
            const { selection } = tr;
            const nodeBefore = selection.$from.nodeBefore;

            if (block.type !== "quote") return false;
            if (!selection.empty) return false;
            if (
              selection.$from.parentOffset !==
              selection.$from.parent.content.size
            ) {
              return false;
            }
            if (nodeBefore?.type.name !== "hardBreak") return false;

            // 空引用行上再次按 Enter 时，移除末尾换行并切到引用块后的普通段落。
            tr.delete(selection.from - nodeBefore.nodeSize, selection.from);
            const [insertedBlock] = insertBlocks(
              tr,
              [{ type: "paragraph", content: "" }],
              block,
              "after",
            );
            const insertedNode = getNodeById(insertedBlock.id, tr.doc);
            if (insertedNode) {
              const insertedInfo = getBlockInfo(insertedNode);
              if (insertedInfo.isBlockContainer) {
                tr.setSelection(
                  TextSelection.create(
                    tr.doc,
                    insertedInfo.blockContent.beforePos + 1,
                  ),
                );
              }
            }
            tr.scrollIntoView();

            return true;
          });
        },
      },
    }),
  ],
};

export const editorBlockSpecs = {
  ...defaultBlockSpecs,
  codeBlock: editorCodeBlockSpec,
  quote: editorQuoteBlockSpec,
};

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: editorBlockSpecs,
});
