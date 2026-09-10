import { BlockNoteEditor } from "@blocknote/core";
import { expect, it, vi } from "vitest";
import { EditorDocumentIndex } from "./editor-document-index";
import { EditorPerformanceSamples } from "./editor-performance";
import { parseMarkdown } from "./markdown";
import { RichPreviewCache } from "./rich-preview-cache";

it.each([10_000, 50_000, 100_000])(
  "keeps ordinary input and preview work bounded for a %i character mixed document",
  async (size) => {
    const section = `# 性能测试标题\n\n${"这是用于性能测试的正文。".repeat(20)}\n\n- 列表一\n- 列表二\n\n\`\`\`ts\nconst value = 42;\n\`\`\`\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n`;
    const source = section
      .repeat(Math.ceil(size / section.length))
      .slice(0, size);
    const editor = BlockNoteEditor.create();
    const startedAt = performance.now();
    const blocks = await parseMarkdown(editor, source);
    const parseMs = performance.now() - startedAt;
    editor.replaceBlocks(editor.document, blocks);
    const index = new EditorDocumentIndex();
    const initialOutline = index.read(editor.prosemirrorState.doc);
    const exported = vi.spyOn(editor, "blocksToFullHTML");
    const preview = new RichPreviewCache(editor);
    preview.seed(editor.document);
    const samples = new EditorPerformanceSamples();
    // 无窗口模型基准只验证计算量，不将 jsdom 耗时当作 Electron 点击到绘制延迟。
    // oxlint-disable-next-line eslint/no-underscore-dangle
    editor._tiptapEditor.on("transaction", ({ transaction }) => {
      index.apply(transaction);
      preview.handleTransaction(transaction);
    });
    try {
      for (let sample = 0; sample < 30; sample++) {
        const start = performance.now();
        editor.prosemirrorView.dispatch(
          editor.prosemirrorState.tr.insertText("字", 3),
        );
        samples.record("editor:transaction", performance.now() - start);
      }
      expect(
        index.read(editor.prosemirrorState.doc).activeHeadingIdByBlockId,
      ).toBe(initialOutline.activeHeadingIdByBlockId);
      expect(index.textLength).toBe(
        editor.prosemirrorState.doc.textContent.length,
      );
      expect(exported).not.toHaveBeenCalled();
      expect(preview.getDiagnostics().cachedBlocks).toBe(0);
      if (process.env.EDITOR_PERF_REPORT === "1") {
        console.info(
          "[editor-model-benchmark]",
          JSON.stringify({
            characters: size,
            blocks: blocks.length,
            parseMs,
            timings: samples.read(),
            preview: preview.getDiagnostics(),
          }),
        );
      }
    } finally {
      preview.destroy();
      // oxlint-disable-next-line eslint/no-underscore-dangle
      editor._tiptapEditor.destroy();
    }
  },
);
