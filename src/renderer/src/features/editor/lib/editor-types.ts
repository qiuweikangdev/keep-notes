import type { InlineContent as CoreInlineContent } from "@blocknote/core";
import type { editorSchema } from "./blocknote-schema";

export type RichEditor = typeof editorSchema.BlockNoteEditor;
export type RichBlock = typeof editorSchema.Block;
export type RichPartialBlock = typeof editorSchema.PartialBlock;
export type RichInlineContent = CoreInlineContent<
  typeof editorSchema.inlineContentSchema,
  typeof editorSchema.styleSchema
>;
