import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { TextSelection } from "@tiptap/pm/state";
import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDiffStore } from "@/store/diff.store";
import type { EditorPanelGroup } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";
import { editorSchema } from "../lib/blocknote-schema";
import { editorCache, editorSaveCoordinator } from "../lib/editor-runtime";
import { RichPreviewCache } from "../lib/rich-preview-cache";
import {
  BlockNoteEditor,
  EditorFormattingToolbar,
  handleRichEditorHeadingShortcut,
  handleRichEditorSelectAllShortcut,
  focusEditorOutlineBlock,
  moveCursorAfterUploadedImage,
  richEditorDefaultUIProps,
  uploadEditorImageFileAsAttachment,
  selectEntireRichEditorContent,
  shouldLetCodeMirrorHandleKeyboardEvent,
  shouldMarkRichEditorPointerIntent,
  type RichBlockNoteRuntime,
  type RichEditorSessionController,
} from "./blocknote-editor";

type SerializeMarkdown = typeof import("../lib/markdown").serializeMarkdown;

const markdownMocks = vi.hoisted(() => ({
  actualSerializeMarkdown: null as SerializeMarkdown | null,
  serializeMarkdown: vi.fn<SerializeMarkdown>(),
}));

vi.mock("../lib/markdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/markdown")>();
  markdownMocks.actualSerializeMarkdown = actual.serializeMarkdown;
  return {
    ...actual,
    serializeMarkdown: markdownMocks.serializeMarkdown,
  };
});

beforeEach(() => {
  markdownMocks.serializeMarkdown.mockReset();
  markdownMocks.serializeMarkdown.mockImplementation((...args) =>
    markdownMocks.actualSerializeMarkdown!(...args),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createRect() {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function* emptyRectIterator() {
  yield* [];
}

function createRectList() {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: emptyRectIterator,
  } as DOMRectList;
}

function setupMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: "",
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

function setupDomMeasurements() {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: createRect,
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: createRectList,
  });
  Object.defineProperty(HTMLElement.prototype, "getClientRects", {
    configurable: true,
    value: createRectList,
  });
}

function selectTextByContent(editor: CoreBlockNoteEditor, text: string) {
  const view = editor.prosemirrorView;
  let from: number | null = null;
  let to: number | null = null;

  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      from = pos;
      to = pos + node.nodeSize;
      return false;
    }

    return true;
  });

  if (from === null || to === null) {
    throw new Error(`Could not find text: ${text}`);
  }

  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)),
  );
}

describe("BlockNoteEditor rich text selection", () => {
  it("enables the default block side menu for block insert and drag controls", () => {
    expect(richEditorDefaultUIProps.sideMenu).toBe(true);
  });

  it("selects the entire ProseMirror document", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "First line" },
        { type: "paragraph", content: "Second line" },
      ],
    });

    expect(selectEntireRichEditorContent(editor)).toBe(true);

    const { doc, selection } = editor.prosemirrorView.state;
    expect(selection.from).toBe(0);
    expect(selection.to).toBe(doc.content.size);
  });

  it("handles command/control+a as full rich editor selection", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "First line" },
        { type: "paragraph", content: "Second line" },
      ],
    });
    const event = {
      altKey: false,
      ctrlKey: false,
      key: "a",
      metaKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: document.createElement("div"),
    };

    expect(handleRichEditorSelectAllShortcut(event, editor)).toBe(true);

    const { doc, selection } = editor.prosemirrorView.state;
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(selection.from).toBe(0);
    expect(selection.to).toBe(doc.content.size);
  });

  it("lets CodeMirror handle command/control+a inside code blocks", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "First line" },
        { type: "paragraph", content: "Second line" },
      ],
    });
    const codeMirror = document.createElement("div");
    codeMirror.className = "editor-code-block__codemirror";
    const content = document.createElement("div");
    content.className = "cm-content";
    codeMirror.append(content);
    const event = {
      altKey: false,
      ctrlKey: false,
      key: "a",
      metaKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: content,
    };

    expect(shouldLetCodeMirrorHandleKeyboardEvent(content)).toBe(true);
    expect(handleRichEditorSelectAllShortcut(event, editor)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});

describe("BlockNoteEditor heading shortcuts", () => {
  it("handles command/control+number as heading level shortcut", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "Heading text" }],
    });
    editor.setTextCursorPosition(editor.document[0].id, "end");
    const event = {
      altKey: false,
      ctrlKey: true,
      key: "2",
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    expect(handleRichEditorHeadingShortcut(event, editor)).toBe(true);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(editor.document[0].type).toBe("heading");
    expect(editor.document[0].props.level).toBe(2);
  });
});

describe("BlockNoteEditor formatting toolbar", () => {
  it("shows an inline code action in the floating formatting toolbar", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "测试" }],
    });

    const { container } = render(
      createElement(
        BlockNoteView,
        {
          editor,
          formattingToolbar: false,
        },
        createElement(EditorFormattingToolbar),
      ),
    );

    editor.setTextCursorPosition(editor.document[0].id, "start");

    act(() => {
      editor.getExtension(FormattingToolbarExtension)?.store.setState(true);
    });

    await waitFor(() => {
      expect(
        container.querySelector(
          'button[aria-label="Inline code (persists in markdown)"]',
        ),
      ).not.toBe(null);
    });
  });

  it("turns selected markdown inline code markers into a code style", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "`test`" }],
    });

    const { container } = render(
      createElement(
        BlockNoteView,
        {
          editor,
          formattingToolbar: false,
        },
        createElement(EditorFormattingToolbar),
      ),
    );

    selectTextByContent(editor, "`test`");

    act(() => {
      editor.getExtension(FormattingToolbarExtension)?.store.setState(true);
    });

    const button = await waitFor(() => {
      const action = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Inline code (persists in markdown)"]',
      );
      expect(action).not.toBe(null);
      return action!;
    });

    fireEvent.click(button);

    expect(editor.document[0].content).toEqual([
      {
        type: "text",
        text: "test",
        styles: {
          code: true,
        },
      },
    ]);
  });
});

describe("BlockNoteEditor outline navigation focus", () => {
  it("focuses the editor before moving the cursor to an outline block", () => {
    const calls: string[] = [];
    const editor = {
      getBlock: vi.fn(() => ({ id: "heading-1", type: "heading" })),
      focus: vi.fn(() => calls.push("focus")),
      setTextCursorPosition: vi.fn(() => calls.push("set-cursor")),
    };
    const scrollSelection = vi.fn(() => {
      calls.push("scroll-selection");
      return true;
    });

    expect(focusEditorOutlineBlock(editor, "heading-1", scrollSelection)).toBe(
      true,
    );

    expect(calls).toEqual(["focus", "set-cursor", "scroll-selection"]);
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
      "heading-1",
      "start",
    );
  });
});

describe("BlockNoteEditor pasted image selection", () => {
  it("moves the cursor to the following text block after an uploaded image", () => {
    const editor = {
      document: [
        { id: "image-1", type: "image" },
        { id: "paragraph-1", type: "paragraph" },
      ],
      getBlock: vi.fn((id: string) =>
        id === "image-1" ? { id: "image-1", type: "image" } : undefined,
      ),
      insertBlocks: vi.fn(),
      setTextCursorPosition: vi.fn(),
    };

    expect(moveCursorAfterUploadedImage(editor, "image-1")).toBe(true);

    expect(editor.insertBlocks).not.toHaveBeenCalled();
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
      "paragraph-1",
      "start",
    );
  });

  it("creates a following text block when the uploaded image is last", () => {
    const insertedBlock = { id: "paragraph-2", type: "paragraph" };
    const editor = {
      document: [{ id: "image-1", type: "image" }],
      getBlock: vi.fn((id: string) =>
        id === "image-1" ? { id: "image-1", type: "image" } : undefined,
      ),
      insertBlocks: vi.fn(() => [insertedBlock]),
      setTextCursorPosition: vi.fn(),
    };

    expect(moveCursorAfterUploadedImage(editor, "image-1")).toBe(true);

    expect(editor.insertBlocks).toHaveBeenCalledWith(
      [{ type: "paragraph", content: "" }],
      "image-1",
      "after",
    );
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
      "paragraph-2",
      "start",
    );
  });

  it("does not move the cursor for non-image upload blocks", () => {
    const editor = {
      document: [{ id: "paragraph-1", type: "paragraph" }],
      getBlock: vi.fn(() => ({ id: "paragraph-1", type: "paragraph" })),
      insertBlocks: vi.fn(),
      setTextCursorPosition: vi.fn(),
    };

    expect(moveCursorAfterUploadedImage(editor, "paragraph-1")).toBe(false);

    expect(editor.insertBlocks).not.toHaveBeenCalled();
    expect(editor.setTextCursorPosition).not.toHaveBeenCalled();
  });
});

describe("BlockNoteEditor pasted image upload", () => {
  it("uses the latest workspace path when saving pasted images", async () => {
    let workspaceRootPath: string | null = null;
    const saveImageAttachment = vi.fn(async () => ({
      code: 1,
      data: {
        filePath: "/workspace/notes/attachments/1782999636770-image.png",
        url: "attachments/1782999636770-image.png",
      },
    }));
    const file = new File([Uint8Array.from([1, 2, 3])], "image.png", {
      type: "image/png",
    });

    workspaceRootPath = "/workspace/notes";
    const url = await uploadEditorImageFileAsAttachment(file, {
      getWorkspaceRootPath: () => workspaceRootPath,
      getMarkdownFilePath: () => "/workspace/notes/daily.md",
      saveImageAttachment,
      moveCursorAfterUpload: vi.fn(),
    });

    expect(url).toBe("attachments/1782999636770-image.png");
    expect(saveImageAttachment).toHaveBeenCalledWith({
      workspaceRootPath: "/workspace/notes",
      markdownFilePath: "/workspace/notes/daily.md",
      fileName: "image.png",
      mimeType: "image/png",
      data: Uint8Array.from([1, 2, 3]).buffer,
    });
  });
});

describe("BlockNoteEditor user intent tracking", () => {
  it("ignores pointer events from code block display controls", () => {
    const shell = document.createElement("div");
    shell.className = "editor-code-block-shell";
    const gutter = document.createElement("div");
    gutter.className = "cm-gutters";
    const foldButton = document.createElement("button");
    foldButton.className = "cm-foldGutter";
    gutter.append(foldButton);
    shell.append(gutter);

    expect(shouldMarkRichEditorPointerIntent(foldButton)).toBe(false);
    expect(shouldMarkRichEditorPointerIntent(gutter)).toBe(false);
  });

  it("keeps pointer intent tracking for code block toolbar actions", () => {
    const toolbar = document.createElement("div");
    toolbar.className = "editor-code-block__toolbar";
    const languageButton = document.createElement("button");
    languageButton.className = "editor-code-block-language-trigger";
    toolbar.append(languageButton);

    expect(shouldMarkRichEditorPointerIntent(languageButton)).toBe(true);
  });

  it("keeps pointer intent tracking for editable code content", () => {
    const shell = document.createElement("div");
    shell.className = "editor-code-block-shell";
    const code = document.createElement("code");
    code.className = "editor-code-block__content";
    shell.append(code);

    expect(shouldMarkRichEditorPointerIntent(code)).toBe(true);
  });
});

describe("BlockNoteEditor persistent session runtime", () => {
  it("does not create a core editor for a render that never commits", () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/discarded.md");
    const createEditor = vi.spyOn(CoreBlockNoteEditor, "create");
    const session = createRealSession("C:/notes/discarded.md");

    try {
      renderToString(session.editor);
    } catch {
      // 当前实现会在 SSR 深入 BlockNote 子树后失败；本用例只观察 commit 前是否构造 core editor。
    }

    expect(createEditor).not.toHaveBeenCalled();
    expect(session.runtime.current).toBeNull();
  });

  it("uses normalized path identity for runtime state and a real preview cache", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:\\notes\\shared.md", {
      isDirty: true,
      loadStatus: "loading",
      saveStatus: "saving",
    });
    const seed = vi.spyOn(RichPreviewCache.prototype, "seed");
    const handleTransaction = vi.spyOn(
      RichPreviewCache.prototype,
      "handleTransaction",
    );
    const session = renderRealSession("C:/notes/shared.md");

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;

    expect(runtime.isDirty()).toBe(true);
    expect(runtime.isSaving()).toBe(true);
    expect(runtime.isReloading()).toBe(true);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(runtime.previewCache).toBeInstanceOf(RichPreviewCache);

    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    );
    expect(scrollContainer).not.toBeNull();
    scrollContainer!.scrollTop = 84;
    expect(runtime.readViewState().scrollTop).toBe(84);
    runtime.restoreViewState({ scrollTop: 21, selection: null });
    expect(scrollContainer!.scrollTop).toBe(21);

    const transactionCount = handleTransaction.mock.calls.length;
    act(() => {
      runtime.editor.updateBlock(runtime.editor.document[0], {
        content: "Changed once",
      });
    });
    expect(handleTransaction).toHaveBeenCalledTimes(transactionCount + 1);

    const initialRuntime = session.runtime.current;
    const initialEditor = runtime.editor;
    session.view.rerender(
      createElement(BlockNoteEditor, {
        content: "# Reloaded",
        controller: session.controller,
        reloadKey: 1,
        surface: session.surface,
      }),
    );
    await waitFor(() =>
      expect(JSON.stringify(initialEditor.document)).toContain("Reloaded"),
    );
    expect(session.runtime.current).toBe(initialRuntime);
    expect(session.runtime.current?.editor).toBe(initialEditor);

    session.view.unmount();
  });

  it("does not destroy the owned editor during StrictMode rehearsal", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/strict.md");
    const createEditor = vi.spyOn(CoreBlockNoteEditor, "create");
    const handleTransaction = vi.spyOn(
      RichPreviewCache.prototype,
      "handleTransaction",
    );
    const session = renderRealSession("C:/notes/strict.md", true);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    expect(createEditor).toHaveBeenCalledTimes(1);
    const runtime = session.runtime.current!;
    // oxlint-disable-next-line eslint/no-underscore-dangle
    const destroy = vi.spyOn(runtime.editor._tiptapEditor, "destroy");

    expect(runtime.editor.document[0]).toBeDefined();
    expect(destroy).not.toHaveBeenCalled();
    session.view.unmount();

    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
    // oxlint-disable-next-line eslint/no-underscore-dangle
    expect(runtime.editor._tiptapEditor.isDestroyed).toBe(true);
    expect(session.runtime.current).toBeNull();

    const transactionCalls = handleTransaction.mock.calls.length;
    // oxlint-disable-next-line eslint/no-underscore-dangle
    const tiptapEditor = runtime.editor._tiptapEditor;
    tiptapEditor.emit("transaction", {
      editor: tiptapEditor,
      transaction: tiptapEditor.state.tr,
    });
    expect(handleTransaction).toHaveBeenCalledTimes(transactionCalls);

    setupSessionTab("C:/notes/strict.md");
    const remounted = renderRealSession("C:/notes/strict.md", true);
    await waitFor(() => expect(remounted.runtime.current).not.toBeNull());
    expect(createEditor).toHaveBeenCalledTimes(2);
    expect(remounted.runtime.current?.editor).not.toBe(runtime.editor);
    // oxlint-disable eslint/no-underscore-dangle
    const remountedTiptapEditor =
      remounted.runtime.current!.editor._tiptapEditor;
    // oxlint-enable eslint/no-underscore-dangle
    const remountedDestroy = vi.spyOn(remountedTiptapEditor, "destroy");
    remounted.view.unmount();
    await waitFor(() => expect(remountedDestroy).toHaveBeenCalledTimes(1));
  });

  it("drops an in-flight serialization after the runtime is destroyed", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/deferred.md");
    useDiffStore.setState({
      isOpen: true,
      filePath: "C:/notes/deferred.md",
      oldContent: "# Initial",
    });
    const session = renderRealSession("C:/notes/deferred.md");

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    await waitFor(() =>
      expect(markdownMocks.serializeMarkdown).toHaveBeenCalled(),
    );
    await act(async () => {
      await markdownMocks.serializeMarkdown.mock.results[0]?.value;
    });

    const deferred = createDeferred<string>();
    markdownMocks.serializeMarkdown.mockClear();
    markdownMocks.serializeMarkdown.mockImplementationOnce(
      () => deferred.promise,
    );
    session.callbacks.onMarkdownChange.mockClear();
    session.callbacks.onWordCountChange.mockClear();
    const cacheContent = vi.spyOn(editorCache, "setContent");
    const cacheBlocks = vi.spyOn(editorCache, "setBlocks");
    const scheduleSave = vi.spyOn(editorSaveCoordinator, "schedule");
    const updateDiff = vi.spyOn(useDiffStore.getState(), "updateContent");
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;

    fireEvent.keyDown(scrollContainer, {
      altKey: false,
      ctrlKey: false,
      key: "x",
      metaKey: false,
    });
    act(() => {
      runtime.editor.updateBlock(runtime.editor.document[0], {
        content: "Deferred change",
      });
    });
    const flushPromise = runtime.serializePendingChange();
    await waitFor(() =>
      expect(markdownMocks.serializeMarkdown).toHaveBeenCalledTimes(1),
    );

    runtime.destroy();
    cacheContent.mockClear();
    cacheBlocks.mockClear();
    deferred.resolve("# Deferred change");
    await act(async () => {
      await flushPromise;
    });

    expect(session.callbacks.onMarkdownChange).not.toHaveBeenCalled();
    expect(session.callbacks.onWordCountChange).not.toHaveBeenCalled();
    expect(updateDiff).not.toHaveBeenCalled();
    expect(scheduleSave).not.toHaveBeenCalled();
    expect(cacheContent).not.toHaveBeenCalled();
    expect(cacheBlocks).not.toHaveBeenCalled();

    session.view.unmount();
  });
});

function setupSessionTab(
  path: string,
  patch: Partial<EditorPanelGroup["tabs"][number]> = {},
): void {
  useEditorStore.setState({
    activeGroupId: "group-session",
    panelGroups: [
      {
        id: "group-session",
        activeTabId: "tab-session",
        direction: "horizontal",
        tabs: [
          {
            id: "tab-session",
            filePath: path,
            pendingFilePath: null,
            content: "# Initial",
            wordCount: 9,
            isDirty: false,
            reloadKey: 0,
            mode: "rich",
            loadStatus: "ready",
            saveStatus: "clean",
            errorMessage: null,
            parseErrorMessage: null,
            scrollTop: 0,
            ...patch,
          },
        ],
      },
    ],
  });
}

function renderRealSession(path: string, strict = false) {
  const session = createRealSession(path);
  const view = render(
    strict ? createElement(StrictMode, null, session.editor) : session.editor,
  );
  return { ...session, view };
}

function createRealSession(path: string) {
  const runtime = { current: null as RichBlockNoteRuntime | null };
  const callbacks = {
    onMarkdownChange: vi.fn((content: string) => {
      const diffState = useDiffStore.getState();
      if (diffState.isOpen && diffState.filePath === path) {
        diffState.updateContent(diffState.oldContent, content);
      }
      editorSaveCoordinator.schedule(path, content);
    }),
    onWordCountChange: vi.fn(),
    onParseStateChange: vi.fn(),
  };
  const controller: RichEditorSessionController = {
    path,
    getActiveBinding: () => ({
      groupId: "group-session",
      tabId: "tab-session",
      paneKey: "group-session:tab-session",
      path,
    }),
    getBoundTabIds: () => ["tab-session"],
    onMarkdownChange: callbacks.onMarkdownChange,
    onWordCountChange: callbacks.onWordCountChange,
    onParseStateChange: callbacks.onParseStateChange,
    onRuntimeReady: (nextRuntime) => {
      runtime.current = nextRuntime;
      return () => {
        if (runtime.current === nextRuntime) runtime.current = null;
      };
    },
  };
  const surface = document.createElement("div");
  const editor = createElement(BlockNoteEditor, {
    content: "# Initial",
    controller,
    reloadKey: 0,
    surface,
  });
  return { callbacks, controller, editor, runtime, surface };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
