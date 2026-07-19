import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeResult, type WorkspaceChangeBatch } from "@shared/types";
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
});
