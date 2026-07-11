import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RichEditorOwnerRegistry,
  type RichEditorOwnerHandlers,
  type RichEditorOwnerProxies,
} from "./rich-editor-owner-registry";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("RichEditorOwnerRegistry", () => {
  it("deduplicates render claims and updates handlers only on commit", async () => {
    const registry = new RichEditorOwnerRegistry();
    let proxies: RichEditorOwnerProxies | null = null;
    const createEditor = vi.fn((nextProxies: RichEditorOwnerProxies) => {
      proxies = nextProxies;
      return createEditorInstance();
    });
    const firstMount = registry.mount(
      "session:C:/notes/a.md",
      "claim-a",
      createHandlers("first"),
      createEditor,
    );
    const first = firstMount.entry;
    expect(createEditor).toHaveBeenCalledTimes(1);
    // oxlint-disable-next-line eslint/no-underscore-dangle
    const destroy = vi.spyOn(first.editor._tiptapEditor, "destroy");

    expect(await proxies!.resolveFileUrl("image.png")).toBe("first:image.png");

    firstMount.release();
    const replayMount = registry.mount(
      "session:C:/notes/a.md",
      "claim-a",
      createHandlers("second"),
      createEditor,
    );
    expect(replayMount.entry).toBe(first);
    await Promise.resolve();

    // Strict effect/layout rehearsal cleanup cannot destroy the entry reclaimed in the same turn.
    expect(destroy).not.toHaveBeenCalled();
    expect(await proxies!.resolveFileUrl("image.png")).toBe("second:image.png");

    replayMount.release();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledTimes(1);

    const remounted = registry.mount(
      "session:C:/notes/a.md",
      "claim-b",
      createHandlers("remount"),
      createEditor,
    );
    expect(remounted.entry.editor).not.toBe(first.editor);
    expect(createEditor).toHaveBeenCalledTimes(2);
    remounted.release();
    await Promise.resolve();
  });

  it("keeps delayed committed and legacy owners alive until authoritative release", async () => {
    vi.useFakeTimers();
    const registry = new RichEditorOwnerRegistry();
    const capturedProxies: RichEditorOwnerProxies[] = [];
    const createEditor = vi.fn((proxies: RichEditorOwnerProxies) => {
      capturedProxies.push(proxies);
      return createEditorInstance();
    });

    // 合法 concurrent render 可以等待任意时长；commit 前 registry 中不存在可被超时销毁的 editor。
    vi.advanceTimersByTime(60_000);
    const first = registry.mount(
      "legacy:group-1:tab-1",
      "claim-1",
      createHandlers("first"),
      createEditor,
    );
    const second = registry.mount(
      "legacy:group-2:tab-2",
      "claim-2",
      createHandlers("second"),
      createEditor,
    );

    expect(first.entry.editor).not.toBe(second.entry.editor);
    expect(createEditor).toHaveBeenCalledTimes(2);
    expect(await capturedProxies[0].resolveFileUrl("image.png")).toBe(
      "first:image.png",
    );
    // oxlint-disable-next-line eslint/no-underscore-dangle
    const destroyFirst = vi.spyOn(first.entry.editor._tiptapEditor, "destroy");
    const destroySecond = vi.spyOn(
      // oxlint-disable-next-line eslint/no-underscore-dangle
      second.entry.editor._tiptapEditor,
      "destroy",
    );

    vi.advanceTimersByTime(60_000);
    expect(destroyFirst).not.toHaveBeenCalled();
    expect(destroySecond).not.toHaveBeenCalled();
    first.release();
    second.release();
    await Promise.resolve();
    expect(destroyFirst).toHaveBeenCalledTimes(1);
    expect(destroySecond).toHaveBeenCalledTimes(1);
  });
});

function createEditorInstance(): CoreBlockNoteEditor {
  return CoreBlockNoteEditor.create({
    initialContent: [{ type: "paragraph", content: "" }],
  });
}

function createHandlers(prefix: string): RichEditorOwnerHandlers {
  return {
    resolveFileUrl: async (url) => `${prefix}:${url}`,
    uploadFile: async (file) => `${prefix}:${file.name}`,
  };
}
