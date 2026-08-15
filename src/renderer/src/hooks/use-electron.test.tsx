import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeResult, type WorkspaceChangeBatch } from "@shared/types";
import {
  backgroundEditorSaveCoordinator,
  editorSaveCoordinator,
  registerEditorChangeFlusher,
  richDocumentSessionManager,
} from "@/features/editor/lib/editor-runtime";
import type { RichDocumentRuntime } from "@/features/editor/lib/rich-document-session-manager";
import { useEditorStore, type EditorMode } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "./use-electron";

describe("useElectron workspace tree loading", () => {
  const readDirectory = vi.fn();
  const generateTree = vi.fn();
  const generateFullTree = vi.fn();
  const watchWorkspace = vi.fn().mockResolvedValue(undefined);
  const unwatchWorkspace = vi.fn().mockResolvedValue(undefined);
  let workspaceChanged: ((batch: WorkspaceChangeBatch) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    backgroundEditorSaveCoordinator.cancelAll();
    workspaceChanged = undefined;
    useTreeStore.getState().resetTree();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readDirectory,
        generateTree,
        generateFullTree,
        watchWorkspace,
        unwatchWorkspace,
        onWorkspaceChanged: vi.fn(
          (callback: (batch: WorkspaceChangeBatch) => void) => {
            workspaceChanged = callback;
            return vi.fn();
          },
        ),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates concurrent reads and caches loaded directory children", async () => {
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "/notes" },
      treeData: [
        {
          title: "docs",
          key: "/notes/docs",
          children: [],
          isLoaded: false,
        },
      ],
    });
    readDirectory.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        children: [{ title: "daily.md", key: "/notes/docs/daily.md" }],
      },
    });
    const { result } = renderHook(() => useElectron());

    await act(async () => {
      await Promise.all([
        result.current.loadDirectory("/notes/docs"),
        result.current.loadDirectory("/notes/docs"),
      ]);
      await result.current.loadDirectory("/notes/docs");
    });

    expect(readDirectory).toHaveBeenCalledTimes(1);
    expect(useTreeStore.getState().treeData[0]).toMatchObject({
      isLoaded: true,
      children: [{ key: "/notes/docs/daily.md" }],
    });
  });

  it("delays the local loading indicator to avoid flicker on fast reads", async () => {
    vi.useFakeTimers();
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "/notes" },
      treeData: [
        {
          title: "docs",
          key: "/notes/docs",
          children: [],
          isLoaded: false,
        },
      ],
    });
    let resolveRead:
      | ((value: { code: CodeResult; data: { children: never[] } }) => void)
      | undefined;
    readDirectory.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const { result } = renderHook(() => useElectron());

    const loadPromise = result.current.loadDirectory("/notes/docs");
    act(() => vi.advanceTimersByTime(119));
    expect(
      useTreeStore.getState().loadingDirectoryKeys.has("/notes/docs"),
    ).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(
      useTreeStore.getState().loadingDirectoryKeys.has("/notes/docs"),
    ).toBe(true);

    resolveRead?.({
      code: CodeResult.Success,
      data: { children: [] },
    });
    await act(async () => loadPromise);
    expect(
      useTreeStore.getState().loadingDirectoryKeys.has("/notes/docs"),
    ).toBe(false);
  });

  it("builds the complete tree only when search requests it", async () => {
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "/notes" },
      treeData: [],
      isTreeFullyLoaded: false,
    });
    generateFullTree.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        treeRoot: { title: "notes", key: "/notes" },
        treeData: [{ title: "daily.md", key: "/notes/deep/daily.md" }],
      },
    });
    const { result } = renderHook(() => useElectron());

    await act(async () => {
      await result.current.ensureFullTreeLoaded();
      await result.current.ensureFullTreeLoaded();
    });

    expect(generateFullTree).toHaveBeenCalledTimes(1);
    expect(useTreeStore.getState().isTreeFullyLoaded).toBe(true);
  });

  it("refreshes only the loaded parent of a structural workspace change", async () => {
    generateTree.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        treeRoot: { title: "notes", key: "/workspace/notes" },
        treeData: [
          {
            title: "docs",
            key: "/workspace/notes/docs",
            children: [],
            isLoaded: false,
          },
        ],
      },
    });
    readDirectory.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        children: [
          {
            title: "new.md",
            key: "/workspace/notes/docs/new.md",
          },
        ],
      },
    });
    const { result } = renderHook(() => useElectron());
    await act(async () => {
      await result.current.loadTree("/workspace/notes");
      await result.current.loadDirectory("/workspace/notes/docs");
    });
    readDirectory.mockClear();

    act(() => {
      workspaceChanged?.({
        rootPath: "/workspace/notes",
        events: [
          {
            eventType: "rename",
            path: "/workspace/notes/docs/new.md",
          },
          {
            eventType: "change",
            path: "/workspace/notes/unchanged.md",
          },
        ],
        hasUnknownPath: false,
      });
    });

    await waitFor(() => {
      expect(readDirectory).toHaveBeenCalledTimes(1);
      expect(readDirectory).toHaveBeenCalledWith("/workspace/notes/docs");
    });
  });

  it("clears old editor tabs when loading a different workspace", async () => {
    useTreeStore.setState({
      treeRoot: { title: "old", key: "/workspace/old" },
      treeData: [],
    });
    useEditorStore.setState({
      activeGroupId: "group-old",
      panelGroups: [
        {
          id: "group-old",
          activeTabId: "tab-old",
          direction: "horizontal",
          tabs: [
            {
              id: "tab-old",
              filePath: "/workspace/old/note.md",
              pendingFilePath: null,
              content: "# Old workspace",
              wordCount: 16,
              isDirty: false,
              reloadKey: 0,
              mode: "source",
              loadStatus: "ready",
              saveStatus: "clean",
              errorMessage: null,
              parseErrorMessage: null,
              scrollTop: 0,
            },
          ],
        },
      ],
    });
    generateTree.mockResolvedValue({
      code: CodeResult.Success,
      data: {
        treeRoot: { title: "new", key: "/workspace/new" },
        treeData: [{ title: "fresh.md", key: "/workspace/new/fresh.md" }],
      },
    });
    const { result } = renderHook(() => useElectron());

    await act(async () => {
      await result.current.loadTree("/workspace/new");
    });

    expect(useTreeStore.getState().treeRoot).toEqual({
      title: "new",
      key: "/workspace/new",
    });
    expect(useEditorStore.getState().panelGroups).toHaveLength(1);
    expect(useEditorStore.getState().panelGroups[0].tabs).toEqual([]);
  });
});

describe("useElectron file reuse", () => {
  const readFile = vi.fn();
  const writeFile = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useTreeStore.getState().resetTree();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readFile,
        writeFile,
      },
    });
  });

  it("opens an externally requested file in a new tab", async () => {
    const previousPath = "C:/notes/current.md";
    const targetPath = "C:/outside/external.md";
    setupOpenFileTab(previousPath, "# Current", "source");
    readFile.mockResolvedValue("# External");
    const { result } = renderHook(() => useElectron());

    await act(async () => {
      await result.current.openFile(targetPath, undefined, {
        openInNewTab: true,
      });
    });

    const tabs = useEditorStore.getState().panelGroups[0].tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toMatchObject({
      filePath: previousPath,
      content: "# Current",
    });
    expect(tabs[1]).toMatchObject({
      filePath: targetPath,
      content: "# External",
      loadStatus: "ready",
    });
  });

  it("opens the target before a previous large rich-text serialization settles", async () => {
    vi.useFakeTimers();
    const previousPath = "C:/notes/large-previous.md";
    const targetPath = "C:/notes/large-target.md";
    const deferredSerialization = createDeferred<void>();
    const serializePendingChange = vi.fn(async () => {
      await deferredSerialization.promise;
      editorSaveCoordinator.schedule(previousPath, "# Latest");
    });
    const runtime: RichDocumentRuntime = {
      path: previousPath,
      surface: document.createElement("div"),
      serializePendingChange,
      cancelPendingWork: vi.fn(),
      destroy: vi.fn(),
      isDirty: () => true,
      isSaving: () => false,
      isReloading: () => false,
    };
    const unregisterRuntime = richDocumentSessionManager.registerRuntime(
      previousPath,
      runtime,
    );
    const unregisterFlusher = registerEditorChangeFlusher(
      "group-open-file",
      "tab-open-file",
      () => richDocumentSessionManager.serializePendingChange(previousPath),
    );
    setupOpenFileTab(previousPath, "x".repeat(10_000), "rich");
    readFile.mockResolvedValue("# Target");
    const { result } = renderHook(() => useElectron());
    let openPromise: Promise<void> | undefined;

    try {
      openPromise = result.current.openFile(targetPath);

      expect(readFile).toHaveBeenCalledWith(targetPath);
      await act(async () => openPromise);
      expect(useEditorStore.getState().panelGroups[0].tabs[0]).toMatchObject({
        filePath: targetPath,
        content: "# Target",
        loadStatus: "ready",
      });
      expect(richDocumentSessionManager.getBoundTabIds(previousPath)).toContain(
        "tab-open-file",
      );
      expect(backgroundEditorSaveCoordinator.hasPending(previousPath)).toBe(
        true,
      );

      await act(async () => vi.runOnlyPendingTimersAsync());
      expect(serializePendingChange).toHaveBeenCalledOnce();
      expect(richDocumentSessionManager.getBoundTabIds(previousPath)).toContain(
        "tab-open-file",
      );

      await act(async () => {
        deferredSerialization.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(writeFile).toHaveBeenCalledWith(previousPath, "# Latest");
      expect(
        richDocumentSessionManager.getBoundTabIds(previousPath),
      ).not.toContain("tab-open-file");
      expect(backgroundEditorSaveCoordinator.hasPending(previousPath)).toBe(
        false,
      );
    } finally {
      deferredSerialization.resolve();
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
        await openPromise;
      });
      unregisterFlusher();
      unregisterRuntime();
      editorSaveCoordinator.cancel(previousPath);
      vi.useRealTimers();
    }
  });

  it("retains and retries a large rich-text background save after serialization fails", async () => {
    vi.useFakeTimers();
    const previousPath = "C:/notes/large-retry-previous.md";
    const targetPath = "C:/notes/large-retry-target.md";
    const serializePendingChange = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("serialize failed"))
      .mockImplementationOnce(async () => {
        editorSaveCoordinator.schedule(previousPath, "# Retried latest");
      });
    const runtime: RichDocumentRuntime = {
      path: previousPath,
      surface: document.createElement("div"),
      serializePendingChange,
      cancelPendingWork: vi.fn(),
      destroy: vi.fn(),
      isDirty: () => true,
      isSaving: () => false,
      isReloading: () => false,
    };
    const unregisterRuntime = richDocumentSessionManager.registerRuntime(
      previousPath,
      runtime,
    );
    setupOpenFileTab(previousPath, "x".repeat(10_000), "rich");
    readFile.mockResolvedValue("# Target");
    const { result } = renderHook(() => useElectron());

    try {
      await act(async () => result.current.openFile(targetPath));
      await act(async () => vi.runOnlyPendingTimersAsync());

      expect(backgroundEditorSaveCoordinator.hasPending(previousPath)).toBe(
        true,
      );
      expect(richDocumentSessionManager.getBoundTabIds(previousPath)).toContain(
        "tab-open-file",
      );

      await expect(
        backgroundEditorSaveCoordinator.getNextCloseSnapshot(),
      ).resolves.toBeNull();
      expect(serializePendingChange).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenCalledWith(previousPath, "# Retried latest");
      expect(backgroundEditorSaveCoordinator.hasPending(previousPath)).toBe(
        false,
      );
      expect(
        richDocumentSessionManager.getBoundTabIds(previousPath),
      ).not.toContain("tab-open-file");
    } finally {
      backgroundEditorSaveCoordinator.cancelAll();
      unregisterRuntime();
      editorSaveCoordinator.cancel(previousPath);
      vi.useRealTimers();
    }
  });

  it.each([
    { label: "small rich-text", content: "x".repeat(9_999), mode: "rich" },
    { label: "large source-mode", content: "x".repeat(10_000), mode: "source" },
  ] as const)("keeps $label reuse synchronous", async ({ content, mode }) => {
    const previousPath = `C:/notes/${mode}-${content.length}-previous.md`;
    const targetPath = `C:/notes/${mode}-${content.length}-target.md`;
    const deferredFlush = createDeferred<void>();
    const unregisterFlusher = registerEditorChangeFlusher(
      "group-open-file",
      "tab-open-file",
      () => deferredFlush.promise,
    );
    setupOpenFileTab(previousPath, content, mode);
    readFile.mockResolvedValue("# Target");
    const { result } = renderHook(() => useElectron());
    const openPromise = result.current.openFile(targetPath);

    try {
      expect(readFile).not.toHaveBeenCalled();
      deferredFlush.resolve();
      await act(async () => openPromise);
      expect(readFile).toHaveBeenCalledWith(targetPath);
    } finally {
      deferredFlush.resolve();
      await act(async () => openPromise);
      unregisterFlusher();
      editorSaveCoordinator.cancel(previousPath);
    }
  });
});

function setupOpenFileTab(
  path: string,
  content: string,
  mode: EditorMode,
): void {
  useEditorStore.setState({
    activeGroupId: "group-open-file",
    content,
    filePath: path,
    isDirty: true,
    panelGroups: [
      {
        id: "group-open-file",
        activeTabId: "tab-open-file",
        direction: "horizontal",
        tabs: [
          {
            id: "tab-open-file",
            filePath: path,
            pendingFilePath: null,
            content,
            wordCount: content.length,
            isDirty: true,
            reloadKey: 0,
            mode,
            loadStatus: "ready",
            saveStatus: "dirty",
            errorMessage: null,
            parseErrorMessage: null,
            scrollTop: 0,
          },
        ],
      },
    ],
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
