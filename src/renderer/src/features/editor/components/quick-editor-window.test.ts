import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createQuickEditorImageUploader,
  hasMeaningfulQuickEditorContent,
  QuickEditorWindow,
  resolveQuickEditorMarkdown,
  uploadQuickEditorImage,
} from "./quick-editor-window";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("quick editor content detection", () => {
  it("treats the initial empty paragraph as clean", () => {
    expect(
      hasMeaningfulQuickEditorContent([
        { type: "paragraph", content: [], children: [] },
      ]),
    ).toBe(false);
  });

  it("detects text, nested blocks, and non-paragraph content", () => {
    expect(
      hasMeaningfulQuickEditorContent([
        { type: "paragraph", content: [{ type: "text", text: "笔记" }] },
      ]),
    ).toBe(true);
    expect(
      hasMeaningfulQuickEditorContent([
        {
          type: "paragraph",
          content: [],
          children: [{ type: "heading", content: [] }],
        },
      ]),
    ).toBe(true);
    expect(
      hasMeaningfulQuickEditorContent([{ type: "image", content: [] }]),
    ).toBe(true);
  });

  it("embeds pasted images in the quick-editor draft", async () => {
    const file = new File([Uint8Array.from([1, 2, 3])], "clip.png", {
      type: "image/png",
    });

    await expect(uploadQuickEditorImage(file)).resolves.toBe(
      "data:image/png;base64,AQID",
    );
  });

  it("moves the cursor after a pasted image instead of selecting the image", async () => {
    const setTextCursorPosition = vi.fn();
    const editor = {
      document: [
        { id: "image-1", type: "image" },
        { id: "paragraph-1", type: "paragraph" },
      ],
      getBlock: vi.fn(() => ({ id: "image-1", type: "image" })),
      insertBlocks: vi.fn(),
      setTextCursorPosition,
    };
    const uploader = createQuickEditorImageUploader(
      () => editor,
      (callback) => callback(),
    );
    const file = new File([Uint8Array.from([1, 2, 3])], "clip.png", {
      type: "image/png",
    });

    await uploader(file, "image-1");

    expect(setTextCursorPosition).toHaveBeenCalledWith("paragraph-1", "start");
  });

  it("creates a standalone BlockNote editor without an outer provider", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    const createQuickEditorWindow = vi.fn();
    const onQuickEditorInitialContent = vi.fn(
      (callback: (content: { content: string; source: null }) => void) => {
        callback({ content: "222", source: null });
        return () => undefined;
      },
    );
    vi.stubGlobal("electronAPI", {
      createQuickEditorWindow,
      getQuickEditorCollapsed: vi.fn(async () => false),
      setQuickEditorCollapsed: vi.fn(async (collapsed: boolean) => collapsed),
      onQuickEditorInitialContent,
      onQuickEditorContentUpdated: vi.fn(() => () => undefined),
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      syncQuickEditorContent: vi.fn(),
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    expect(
      screen.getByRole("main", { name: "快速编辑器" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("222")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建浮窗编辑器" }));
    expect(createQuickEditorWindow).toHaveBeenCalledOnce();
  });

  it("does not rewrite unordered-list markers when linked content opens", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    const source = {
      groupId: "group-1",
      tabId: "tab-1",
      filePath: "/notes/readme.md",
    };
    const syncQuickEditorContent = vi.fn();
    vi.stubGlobal("electronAPI", {
      createQuickEditorWindow: vi.fn(),
      getQuickEditorCollapsed: vi.fn(async () => false),
      setQuickEditorCollapsed: vi.fn(async (collapsed: boolean) => collapsed),
      onQuickEditorInitialContent: vi.fn(
        (
          callback: (content: {
            content: string;
            source: typeof source;
          }) => void,
        ) => {
          callback({ content: "- alpha\n- beta\n", source });
          return () => undefined;
        },
      ),
      onQuickEditorContentUpdated: vi.fn(() => () => undefined),
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      syncQuickEditorContent,
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });
    expect(syncQuickEditorContent).not.toHaveBeenCalled();
  });

  it("applies live source-tab updates without returning to the application", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    const source = {
      groupId: "group-1",
      tabId: "tab-1",
      filePath: "/notes/readme.md",
    };
    let liveContentListener:
      | ((content: { content: string; source: typeof source }) => void)
      | undefined;
    const onQuickEditorContentUpdated = vi.fn(
      (
        callback: (content: { content: string; source: typeof source }) => void,
      ) => {
        liveContentListener = callback;
        return () => undefined;
      },
    );
    vi.stubGlobal("electronAPI", {
      createQuickEditorWindow: vi.fn(),
      getQuickEditorCollapsed: vi.fn(async () => false),
      setQuickEditorCollapsed: vi.fn(async (collapsed: boolean) => collapsed),
      onQuickEditorInitialContent: vi.fn(
        (
          callback: (content: {
            content: string;
            source: typeof source;
          }) => void,
        ) => {
          callback({ content: "# Initial", source });
          return () => undefined;
        },
      ),
      onQuickEditorContentUpdated,
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      syncQuickEditorContent: vi.fn(),
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    expect(await screen.findByText("Initial")).toBeInTheDocument();
    expect(onQuickEditorContentUpdated).toHaveBeenCalledOnce();

    act(() => {
      liveContentListener?.({ content: "# Live update", source });
    });

    expect(await screen.findByText("Live update")).toBeInTheDocument();
  });

  it("collapses with a single chevron and restores editor focus", async () => {
    let resolveCollapse: ((collapsed: boolean) => void) | undefined;
    const setQuickEditorCollapsed = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveCollapse = resolve;
          }),
      )
      .mockResolvedValueOnce(false);

    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    vi.stubGlobal("electronAPI", {
      createQuickEditorWindow: vi.fn(),
      getQuickEditorCollapsed: vi.fn(async () => false),
      setQuickEditorCollapsed,
      onQuickEditorInitialContent: vi.fn(
        (callback: (content: { content: string; source: null }) => void) => {
          callback({ content: "Preserved draft", source: null });
          return () => undefined;
        },
      ),
      onQuickEditorContentUpdated: vi.fn(() => () => undefined),
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      syncQuickEditorContent: vi.fn(),
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    expect(await screen.findByText("Preserved draft")).toBeInTheDocument();
    const collapseButton = await screen.findByRole("button", {
      name: "折叠编辑器",
    });
    expect(collapseButton.querySelector("svg")).toHaveAttribute("width", "15");

    fireEvent.click(collapseButton);
    expect(setQuickEditorCollapsed).toHaveBeenCalledWith(true, false);
    expect(collapseButton).toBeDisabled();

    await act(async () => {
      resolveCollapse?.(true);
    });
    const expandButton = await screen.findByRole("button", {
      name: "展开编辑器",
    });
    const hiddenEditor = screen.getByRole("main", { hidden: true });
    expect(hiddenEditor).toHaveAttribute("aria-label", "快速编辑器");
    expect(hiddenEditor).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Preserved draft")).toBeInTheDocument();

    expandButton.focus();
    fireEvent.click(expandButton);
    expect(setQuickEditorCollapsed).toHaveBeenLastCalledWith(false, false);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveFocus();
    });
  });

  it("waits for collapsed-state hydration before enabling the control", async () => {
    let resolveInitialState: ((collapsed: boolean) => void) | undefined;
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    vi.stubGlobal("electronAPI", {
      createQuickEditorWindow: vi.fn(),
      getQuickEditorCollapsed: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveInitialState = resolve;
          }),
      ),
      setQuickEditorCollapsed: vi.fn(),
      onQuickEditorInitialContent: vi.fn(() => () => undefined),
      onQuickEditorContentUpdated: vi.fn(() => () => undefined),
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      syncQuickEditorContent: vi.fn(),
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    const collapseButton = screen.getByRole("button", {
      name: "折叠编辑器",
    });
    expect(collapseButton).toBeDisabled();

    await act(async () => {
      resolveInitialState?.(true);
    });

    expect(
      await screen.findByRole("button", { name: "展开编辑器" }),
    ).toBeEnabled();
    expect(screen.getByRole("textbox", { hidden: true })).not.toHaveFocus();
  });

  it("resynchronizes collapsed state after a transition request fails", async () => {
    const getQuickEditorCollapsed = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    vi.stubGlobal("electronAPI", {
      createQuickEditorWindow: vi.fn(),
      getQuickEditorCollapsed,
      setQuickEditorCollapsed: vi.fn(async () => {
        throw new Error("collapse failed");
      }),
      onQuickEditorInitialContent: vi.fn(() => () => undefined),
      onQuickEditorContentUpdated: vi.fn(() => () => undefined),
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      syncQuickEditorContent: vi.fn(),
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    const collapseButton = await screen.findByRole("button", {
      name: "折叠编辑器",
    });
    await waitFor(() => expect(collapseButton).toBeEnabled());
    fireEvent.click(collapseButton);

    expect(
      await screen.findByRole("button", { name: "展开编辑器" }),
    ).toBeEnabled();
    expect(getQuickEditorCollapsed).toHaveBeenCalledTimes(2);
  });
});

describe("quick editor Markdown source preservation", () => {
  it("keeps the original unordered-list markers when opening content", () => {
    const source = "- alpha\n- beta\n";
    const blockNoteBaseline = "* alpha\n* beta\n";

    expect(
      resolveQuickEditorMarkdown(source, blockNoteBaseline, blockNoteBaseline),
    ).toBe(source);
  });

  it("maps actual list edits back onto the original marker style", () => {
    expect(
      resolveQuickEditorMarkdown(
        "- alpha\n- beta\n",
        "* alpha\n* beta\n",
        "* updated\n* beta\n",
      ),
    ).toBe("- updated\n- beta\n");
  });
});
