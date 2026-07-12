import {
  BlockNoteSchema,
  createBlockSpec,
  createExtension,
  createStyleSpecFromTipTapMark,
  defaultBlockSpecs,
  defaultStyleSpecs,
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
import { InputRule } from "@tiptap/core";
import Code from "@tiptap/extension-code";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { Slice } from "@tiptap/pm/model";

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

const editorInlineCodeStyleSpec = createStyleSpecFromTipTapMark(
  Code.extend({
    addInputRules() {
      return [
        new InputRule({
          find: /(^|[^`])`([^`]+)`(?!`)$/,
          handler: ({ state, range, match }) => {
            const { tr, schema } = state;
            const leadingText = match[1] ?? "";
            const codeText = match[2] ?? "";

            // 默认 markInputRule 会删除匹配到的前导字符；这里仅替换反引号包裹的片段。
            tr.replaceWith(range.from + leadingText.length, range.to, [
              schema.text(codeText, [this.type.create()]),
            ]);
          },
        }),
        new InputRule({
          find: /(^|[^`])`([^`]+)`(?!`) $/,
          handler: ({ state, range, match }) => {
            const { tr, schema } = state;
            const leadingText = match[1] ?? "";
            const codeText = match[2] ?? "";

            // 用户先输入成对反引号再补内容并按空格时，也保留前导字符。
            tr.replaceWith(range.from + leadingText.length, range.to, [
              schema.text(codeText, [this.type.create()]),
              schema.text(" "),
            ]);
          },
        }),
      ];
    },
  }),
  "boolean",
);

const INLINE_CODE_NORMALIZER_META = "editor-inline-code-normalizer";
const inlineCodeMarkerPattern = /`([^`\n]+)`/g;

const inlineCodeNormalizerExtension = createExtension({
  key: "editor-inline-code-normalizer",
  prosemirrorPlugins: [
    new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((transaction) => transaction.docChanged)) {
          return null;
        }
        // 大文档跳过全量扫描，避免每笔按键都遍历所有文本节点阻塞主线程。
        // 用户仍可通过快捷键手动设置行内代码样式。
        if (newState.doc.textContent.length > 6000) return null;
        if (
          transactions.some((transaction) =>
            transaction.getMeta(INLINE_CODE_NORMALIZER_META),
          )
        ) {
          return null;
        }

        const codeMark = newState.schema.marks.code;
        if (!codeMark) return null;

        const replacements: Array<{
          from: number;
          marks: ReturnType<typeof codeMark.create>[];
          text: string;
          to: number;
        }> = [];

        newState.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return true;
          if (node.marks.some((mark) => mark.type === codeMark)) return true;
          if (newState.doc.resolve(pos).parent.type.spec.code) return true;

          for (const match of node.text.matchAll(inlineCodeMarkerPattern)) {
            const matchIndex = match.index;
            const codeText = match[1];
            if (matchIndex === undefined || !codeText) continue;

            replacements.push({
              from: pos + matchIndex,
              marks: [...node.marks, codeMark.create()],
              text: codeText,
              to: pos + matchIndex + match[0].length,
            });
          }

          return true;
        });

        if (replacements.length === 0) return null;

        const tr = newState.tr;
        for (let index = replacements.length - 1; index >= 0; index -= 1) {
          const replacement = replacements[index];

          // 某些输入路径不会触发 input rule，这里在事务尾部兜底清理 Markdown 反引号。
          tr.replaceWith(
            replacement.from,
            replacement.to,
            newState.schema.text(replacement.text, replacement.marks),
          );
        }

        return tr.docChanged
          ? tr.setMeta(INLINE_CODE_NORMALIZER_META, true)
          : null;
      },
    }),
  ],
});

const inlineCodeBackspaceExtension = createExtension({
  key: "editor-inline-code-backspace",
  runsBefore: ["default"],
  keyboardShortcuts: {
    Backspace: ({ editor }) => {
      return editor.transact((tr) => {
        const { selection } = tr;
        const codeMark = tr.doc.type.schema.marks.code;
        const nodeBefore = selection.$from.nodeBefore;

        if (!selection.empty) return false;
        if (!nodeBefore?.isText || !nodeBefore.text) return false;

        const previousCharacter = Array.from(nodeBefore.text).at(-1);
        if (!previousCharacter) return false;

        if (!nodeBefore.marks.some((mark) => mark.type === codeMark)) {
          if (!/^`[^`\n]*$/.test(nodeBefore.text)) return false;

          // 行内代码草稿态继续按普通文本逐字删除。
          tr.delete(
            selection.from - previousCharacter.length,
            selection.from,
          ).scrollIntoView();

          return true;
        }

        const nodeFrom = selection.from - nodeBefore.nodeSize;
        const markdownText = `\`${nodeBefore.text}`;

        // 第一次退格先回到可编辑 Markdown 形态，之后再按普通文本逐字删除。
        tr.replaceWith(
          nodeFrom,
          selection.from,
          tr.doc.type.schema.text(markdownText),
        )
          .setSelection(
            TextSelection.create(tr.doc, nodeFrom + markdownText.length),
          )
          .scrollIntoView();

        return true;
      });
    },
  },
});

const LIST_BLOCK_TYPES = new Set([
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
]);

const listHistoryBoundaryExtension = createExtension({
  key: "editor-list-history-boundary",
  runsBefore: ["default"],
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      const { block } = editor.getTextCursorPosition();
      if (!LIST_BLOCK_TYPES.has(block.type)) return false;

      editor.transact((tr) => {
        // 当前列表项到此结束，下一项内容需要形成独立撤销单元。
        closeHistory(tr);
      });

      return false;
    },
  },
});

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

function getPlainParagraphTextsFromPasteSlice(slice: Slice): string[] | null {
  const texts: string[] = [];

  slice.content.forEach((blockContainer) => {
    const blockContent = blockContainer.firstChild;
    if (blockContent?.type.name !== "paragraph") {
      return;
    }
    texts.push(blockContent.textContent);
  });

  return texts.length === slice.content.childCount ? texts : null;
}

function getPlainBulletListPasteBlocks(slice: Slice) {
  const paragraphTexts = getPlainParagraphTextsFromPasteSlice(slice);
  if (!paragraphTexts) return null;

  const nonEmptyLines = paragraphTexts
    .map((text) => text.trim())
    .filter(Boolean);
  if (nonEmptyLines.length < 2) return null;

  const blocks = nonEmptyLines.map((line) => {
    const match = line.match(/^[-+*]\s+(.+)$/u);
    if (!match) return null;

    return {
      type: "bulletListItem" as const,
      content: match[1],
    };
  });

  return blocks.every((block) => block !== null) ? blocks : null;
}

const plainBulletListPasteExtension = createExtension(({ editor }) => ({
  key: "editor-plain-bullet-list-paste",
  prosemirrorPlugins: [
    new Plugin({
      props: {
        handlePaste(_view, event, slice) {
          const blocks = getPlainBulletListPasteBlocks(slice);
          if (!blocks) return false;

          const { block } = editor.getTextCursorPosition();
          const isEmptyInlineBlock = getInlineContentText(block.content) === "";

          // 纯文本粘贴的 Markdown 列表应进入块结构，避免 * 作为普通正文残留。
          if (isEmptyInlineBlock) {
            editor.replaceBlocks([block], blocks);
          } else {
            editor.insertBlocks(blocks, block, "after");
          }
          event.preventDefault();
          return true;
        },
      },
    }),
  ],
}));

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

const editorBulletListItemSpec = {
  ...defaultBlockSpecs.bulletListItem,
  extensions: [
    ...(defaultBlockSpecs.bulletListItem.extensions ?? []),
    listHistoryBoundaryExtension(),
    plainBulletListPasteExtension(),
  ],
};

const editorParagraphSpec = {
  ...defaultBlockSpecs.paragraph,
  extensions: [
    ...(defaultBlockSpecs.paragraph.extensions ?? []),
    inlineCodeBackspaceExtension(),
    inlineCodeNormalizerExtension(),
  ],
};

export const editorBlockSpecs = {
  ...defaultBlockSpecs,
  bulletListItem: editorBulletListItemSpec,
  codeBlock: editorCodeBlockSpec,
  paragraph: editorParagraphSpec,
  quote: editorQuoteBlockSpec,
};

export const editorStyleSpecs = {
  ...defaultStyleSpecs,
  code: editorInlineCodeStyleSpec,
};

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: editorBlockSpecs,
  styleSpecs: editorStyleSpecs,
});
