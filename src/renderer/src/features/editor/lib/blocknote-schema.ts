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
  nodeToBlock,
  updateBlockTr,
  type CodeBlockOptions,
} from "@blocknote/core";
import {
  createCodeBlockConfig,
  createCodeBlockSpec,
  createQuoteBlockSpec,
} from "@blocknote/core/blocks";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { InputRule } from "@tiptap/core";
import Code from "@tiptap/extension-code";
import { closeHistory } from "@tiptap/pm/history";
import { AllSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import type { Node, Slice } from "@tiptap/pm/model";

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

const fullDocumentClearExtension = createExtension({
  key: "editor-full-document-clear",
  runsBefore: ["default"],
  keyboardShortcuts: {
    Backspace: ({ editor }) => {
      if (!(editor.prosemirrorState.selection instanceof AllSelection)) {
        return false;
      }

      // 全文选中时统一替换为一个空段落，让光标回到折叠状态并隐藏格式工具栏。
      const { insertedBlocks } = editor.replaceBlocks(editor.document, [
        { type: "paragraph", content: "" },
      ]);
      editor.setTextCursorPosition(insertedBlocks[0].id, "start");
      return true;
    },
    Delete: ({ editor }) => {
      if (!(editor.prosemirrorState.selection instanceof AllSelection)) {
        return false;
      }

      // Delete 与 Backspace 保持一致，避免不同删除键留下不同的编辑器状态。
      const { insertedBlocks } = editor.replaceBlocks(editor.document, [
        { type: "paragraph", content: "" },
      ]);
      editor.setTextCursorPosition(insertedBlocks[0].id, "start");
      return true;
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

function collectParagraphTextsFromPasteNode(node: Node, texts: string[]) {
  if (node.type.name === "blockContainer") {
    const blockContent = node.firstChild;
    if (blockContent?.type.name !== "paragraph") return false;

    texts.push(blockContent.textContent);
    return true;
  }

  if (node.type.name !== "blockGroup") return false;

  let isPlainParagraphGroup = true;
  node.forEach((child) => {
    if (!collectParagraphTextsFromPasteNode(child, texts)) {
      isPlainParagraphGroup = false;
    }
  });

  return isPlainParagraphGroup;
}

function getPlainParagraphTextsFromPasteSlice(slice: Slice): string[] | null {
  const texts: string[] = [];
  let isPlainParagraphSlice = true;

  slice.content.forEach((node) => {
    if (!collectParagraphTextsFromPasteNode(node, texts)) {
      isPlainParagraphSlice = false;
    }
  });

  return isPlainParagraphSlice ? texts : null;
}

function getQuoteListPasteContent(slice: Slice) {
  const paragraphTexts = getPlainParagraphTextsFromPasteSlice(slice);
  if (!paragraphTexts) return null;

  const nonEmptyLines = paragraphTexts
    .map((text) => text.trim())
    .filter(Boolean);
  const listStart = nonEmptyLines.findIndex((line) =>
    /^[-+*]\s+(.+)$/u.test(line),
  );
  if (listStart === -1) return null;

  const listLines = nonEmptyLines.slice(listStart);
  if (listLines.length < 2) return null;

  const blocks = listLines.map((line) => {
    const match = line.match(/^[-+*]\s+(.+)$/u);
    if (!match) return null;

    return {
      type: "bulletListItem" as const,
      content: match[1],
    };
  });

  if (!blocks.every((block) => block !== null)) return null;

  return {
    blocks,
    leadText: nonEmptyLines.slice(0, listStart).join("\n"),
  };
}

function getPlainBulletListPasteBlocks(slice: Slice) {
  const quoteContent = getQuoteListPasteContent(slice);
  if (!quoteContent || quoteContent.leadText) return null;
  return quoteContent.blocks;
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

function appendPlainTextToInlineContent(content: unknown, text: string) {
  if (!text) return content;
  if (!Array.isArray(content) || content.length === 0) return text;

  return [
    ...content,
    {
      type: "text" as const,
      text: `\n${text}`,
      styles: {},
    },
  ];
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
    createExtension(({ editor }) => ({
      key: "editor-quote-side-menu-parent",
      mount() {
        const sideMenu = editor.getExtension(SideMenuExtension);
        const store = sideMenu?.store;
        if (!store) return;

        return store.subscribe(({ currentVal }) => {
          if (!currentVal) return;

          let parent = editor.getParentBlock(currentVal.block);
          while (parent && parent.type !== "quote") {
            parent = editor.getParentBlock(parent);
          }
          if (!parent || parent.id === currentVal.block.id) return;

          // 引用子块命中 SideMenu 时统一提升到外层引用，确保显示位置和拖拽对象一致。
          store.setState({ ...currentVal, block: parent });
        });
      },
    }))(),
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
    createExtension(({ editor }) => ({
      key: "editor-quote-list-input",
      runsBefore: ["default", "bullet-list-item-shortcuts"],
      inputRules: [
        {
          find: /(?:^|\ufffc)\s?[-+*]\s$/,
          replace() {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== "quote") return;

            // 与默认列表规则在同一输入规则链中抢先命中，直接把列表项放进引用子块。
            return {
              type: "quote",
              props: block.props,
              children: [
                ...block.children,
                { type: "bulletListItem", content: "" },
              ],
            };
          },
        },
      ],
      prosemirrorPlugins: [
        new Plugin({
          props: {
            handlePaste(_view, event, slice) {
              const pasteContent = getQuoteListPasteContent(slice);
              if (!pasteContent) return false;

              const { block } = editor.getTextCursorPosition();
              if (block.type !== "quote") return false;

              // 引用内粘贴的列表保持为引用子块，避免被默认粘贴逻辑拆成同级块。
              editor.replaceBlocks(
                [block],
                [
                  {
                    id: block.id,
                    type: "quote",
                    content: appendPlainTextToInlineContent(
                      block.content,
                      pasteContent.leadText,
                    ) as typeof block.content,
                    props: block.props,
                    children: [...block.children, ...pasteContent.blocks],
                  },
                ],
              );
              event.preventDefault();

              return true;
            },
            handleTextInput(view, from, to, text) {
              if (text !== " " || from !== to) return false;

              const { block } = editor.getTextCursorPosition();
              const { selection } = view.state;
              if (block.type !== "quote") return false;
              if (
                selection.$from.parentOffset !==
                selection.$from.parent.content.size
              ) {
                return false;
              }

              const marker = getInlineContentText(block.content).match(
                /(?:^|\n)[-+*]$/u,
              )?.[0];
              if (!marker) return false;

              const tr = view.state.tr.delete(from - marker.length, from);
              const quoteNode = getNodeById(block.id, tr.doc);
              if (!quoteNode) return false;
              const quote = nodeToBlock(quoteNode.node, tr.doc.type.schema);

              // Chromium 的文本输入路径可能先经过独立插件；默认规则被拦截后在这里完成同样的子块转换。
              updateBlockTr(tr, quoteNode.posBeforeNode, {
                children: [
                  ...quote.children,
                  { type: "bulletListItem", content: "" },
                ],
              });

              const updatedQuoteNode = getNodeById(block.id, tr.doc);
              if (!updatedQuoteNode) return false;
              const updatedQuote = nodeToBlock(
                updatedQuoteNode.node,
                tr.doc.type.schema,
              );
              const child = updatedQuote.children.at(-1);
              const childNode = child && getNodeById(child.id, tr.doc);
              if (childNode) {
                const childInfo = getBlockInfo(childNode);
                if (childInfo.isBlockContainer) {
                  tr.setSelection(
                    TextSelection.create(
                      tr.doc,
                      childInfo.blockContent.beforePos + 1,
                    ),
                  );
                }
              }

              view.dispatch(tr.scrollIntoView());
              return true;
            },
          },
          appendTransaction(transactions, oldState, newState) {
            if (!transactions.some((transaction) => transaction.docChanged)) {
              return null;
            }

            let insertedChildId: string | null = null;
            oldState.doc.descendants((node, position) => {
              if (node.type.name !== "blockContainer") return true;

              const oldInfo = getBlockInfo({
                node,
                posBeforeNode: position,
              });
              if (!oldInfo.isBlockContainer) return true;
              if (oldInfo.blockNoteType !== "quote") return true;

              const id = node.attrs.id;
              if (typeof id !== "string") return true;
              const nextNode = getNodeById(id, newState.doc);
              if (!nextNode) return true;

              const oldQuote = nodeToBlock(node, oldState.doc.type.schema);
              const nextQuote = nodeToBlock(
                nextNode.node,
                newState.doc.type.schema,
              );
              if (nextQuote.type !== "quote") return true;
              if (nextQuote.children.length !== oldQuote.children.length + 1) {
                return true;
              }

              const child = nextQuote.children.at(-1);
              if (child?.type !== "bulletListItem") return true;
              insertedChildId = child.id;
              return false;
            });
            if (!insertedChildId) return null;

            const tr = newState.tr;
            const childNode = getNodeById(insertedChildId, tr.doc);
            if (childNode) {
              const childInfo = getBlockInfo(childNode);
              if (childInfo.isBlockContainer) {
                tr.setSelection(
                  TextSelection.create(
                    tr.doc,
                    childInfo.blockContent.beforePos + 1,
                  ),
                );
              }
            }

            return tr;
          },
        }),
      ],
    }))(),
  ],
};

const quoteAwareBulletListItemExtensions = (
  defaultBlockSpecs.bulletListItem.extensions ?? []
).map((extensionFactory) =>
  createExtension(({ editor }) => {
    const extension = extensionFactory({ editor });
    if (extension.key !== "bullet-list-item-shortcuts") return extension;

    return {
      ...extension,
      inputRules: extension.inputRules?.map((inputRule) => ({
        ...inputRule,
        replace(props) {
          if (props.editor.getTextCursorPosition().block.type === "quote") {
            return;
          }
          return inputRule.replace(props);
        },
      })),
    };
  })(),
);

const editorBulletListItemSpec = {
  ...defaultBlockSpecs.bulletListItem,
  extensions: [
    ...quoteAwareBulletListItemExtensions,
    listHistoryBoundaryExtension(),
    plainBulletListPasteExtension(),
  ],
};

const editorParagraphSpec = {
  ...defaultBlockSpecs.paragraph,
  extensions: [
    ...(defaultBlockSpecs.paragraph.extensions ?? []),
    fullDocumentClearExtension(),
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
