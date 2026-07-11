import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorPanelGroup } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";
import {
  editorSaveCoordinator,
  flushEditorChange,
  richDocumentSessionManager,
} from "../lib/editor-runtime";
import * as editorRuntime from "../lib/editor-runtime";
import { RichDocumentSessionHost } from "./rich-document-session-host";

const sessionMocks = vi.hoisted(() => ({
  mounts: new Map<string, number>(),
  reloads: [] as Array<{ content: string; reloadKey: number }>,
  runtimes: [] as MockRuntime[],
  controller: null as {
    getActiveBinding: () => {
      groupId: string;
      tabId: string;
      paneKey: `${string}:${string}`;
      path: string;
    } | null;
    onMarkdownChange: (content: string) => void;
    onParseStateChange: (message: string | null) => void;
    onRuntimeReady: (runtime: MockRuntime) => () => void;
    onWordCountChange: (count: number) => void;
    path: string;
  } | null,
}));

interface MockRuntime {
  path: string;
  surface: HTMLElement;
  serializePendingChange: () => Promise<void>;
  cancelPendingWork: () => void;
  destroy: () => void;
  isDirty: () => boolean;
  isSaving: () => boolean;
  isReloading: () => boolean;
  editor: { replaceBlocks: ReturnType<typeof vi.fn> };
  previewCache: object;
  focusAt: () => void;
  readViewState: () => { scrollTop: number; selection: null };
  restoreViewState: () => void;
  scrollToBlock: () => boolean;
}

vi.mock("./blocknote-editor", () => ({
  BlockNoteEditor: ({
    content,
    controller,
    reloadKey,
    surface,
  }: {
    content: string;
    controller: NonNullable<typeof sessionMocks.controller>;
    reloadKey: number;
    surface: HTMLElement;
  }) => {
    const appliedReloadKeyRef = useRef<number | null>(null);
    useEffect(() => {
      sessionMocks.mounts.set(
        controller.path,
        (sessionMocks.mounts.get(controller.path) ?? 0) + 1,
      );
      sessionMocks.controller = controller;
      const runtime: MockRuntime = {
        path: controller.path,
        surface,
        serializePendingChange: vi.fn(async () => {
          controller.onMarkdownChange("# Serialized");
        }),
        cancelPendingWork: vi.fn(),
        destroy: vi.fn(),
        isDirty: () => false,
        isSaving: () => false,
        isReloading: () => false,
        editor: { replaceBlocks: vi.fn() },
        previewCache: {},
        focusAt: vi.fn(),
        readViewState: () => ({ scrollTop: 0, selection: null }),
        restoreViewState: vi.fn(),
        scrollToBlock: () => false,
      };
      sessionMocks.runtimes.push(runtime);
      return controller.onRuntimeReady(runtime);
    }, [controller, surface]);

    useEffect(() => {
      sessionMocks.reloads.push({ content, reloadKey });
      if (
        appliedReloadKeyRef.current !== null &&
        appliedReloadKeyRef.current !== reloadKey
      ) {
        sessionMocks.runtimes.at(-1)?.editor.replaceBlocks();
      }
      appliedReloadKeyRef.current = reloadKey;
    }, [content, reloadKey]);

    return null;
  },
}));

beforeEach(() => {
  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      ...window.electronAPI,
      onFileChanged: vi.fn(() => vi.fn()),
      unwatchFile: vi.fn(),
      watchFile: vi.fn(),
    },
  });
});

afterEach(() => {
  cleanup();
  sessionMocks.mounts.clear();
  sessionMocks.reloads.length = 0;
  sessionMocks.runtimes.length = 0;
  sessionMocks.controller = null;
  editorSaveCoordinator.cancel("C:/notes/shared.md");
  editorSaveCoordinator.cancel("C:\\notes\\shared.md");
  vi.restoreAllMocks();
});

describe("RichDocumentSessionHost", () => {
  it("keeps one I/O path identity when the surviving mixed-slash binding changes", async () => {
    const path = "C:/notes/shared.md";
    const windowsPath = "C:\\notes\\shared.md";
    let emitFileChange:
      | ((changedPath: string, content: string) => void)
      | null = null;
    let finishWrite: (() => void) | null = null;
    const writePromise = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        ...window.electronAPI,
        onFileChanged: vi.fn(
          (listener: (changedPath: string, content: string) => void) => {
            emitFileChange = listener;
            return vi.fn();
          },
        ),
        watchFile: vi.fn(() => Promise.resolve()),
        unwatchFile: vi.fn(() => Promise.resolve()),
        writeFile: vi.fn(() => writePromise),
      },
    });
    const scheduleSave = vi.spyOn(editorSaveCoordinator, "schedule");
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-slash",
          direction: "horizontal",
          tabs: [
            { ...createTab("tab-slash", path), reloadKey: 5 },
            createTab("tab-other", "C:/notes/other.md"),
          ],
        },
        {
          id: "group-2",
          activeTabId: "tab-backslash",
          direction: "horizontal",
          tabs: [{ ...createTab("tab-backslash", windowsPath), reloadKey: 6 }],
        },
      ],
    });
    const releaseSlash = richDocumentSessionManager.retainVisible(path, {
      paneKey: "group-1:tab-slash",
      groupId: "group-1",
      tabId: "tab-slash",
    });
    const releaseBackslash = richDocumentSessionManager.retainVisible(
      windowsPath,
      {
        paneKey: "group-2:tab-backslash",
        groupId: "group-2",
        tabId: "tab-backslash",
      },
    );

    render(<RichDocumentSessionHost path={path} />);
    const runtime = sessionMocks.runtimes[0];
    expect(window.electronAPI.watchFile).toHaveBeenCalledWith(path);

    act(() => {
      releaseSlash();
      useEditorStore.setState((state) => ({
        activeGroupId: "group-2",
        panelGroups: state.panelGroups.map((group) =>
          group.id === "group-1"
            ? { ...group, activeTabId: "tab-other" }
            : group,
        ),
      }));
      sessionMocks.controller?.onMarkdownChange("# Saved snapshot");
    });
    const flushes = [
      editorSaveCoordinator.flush(path),
      editorSaveCoordinator.flush(windowsPath),
    ];

    act(() => {
      sessionMocks.controller?.onMarkdownChange("# Newer edit");
    });
    runtime.editor.replaceBlocks.mockClear();
    act(() => {
      emitFileChange?.(path, "# Saved snapshot");
    });

    const samePathTabs = useEditorStore
      .getState()
      .panelGroups.flatMap((group) => group.tabs)
      .filter((tab) => tab.filePath?.replaceAll("\\", "/") === path);
    expect(samePathTabs.map((tab) => tab.content)).toEqual([
      "# Newer edit",
      "# Newer edit",
    ]);
    expect(samePathTabs.map((tab) => tab.reloadKey)).toEqual([5, 6]);
    expect(runtime.editor.replaceBlocks).not.toHaveBeenCalled();
    expect(scheduleSave).toHaveBeenNthCalledWith(1, path, "# Saved snapshot");
    expect(scheduleSave).toHaveBeenNthCalledWith(2, path, "# Newer edit");
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
      path,
      "# Saved snapshot",
    );

    finishWrite?.();
    await act(async () => {
      await Promise.all(flushes);
    });

    act(() => {
      emitFileChange?.(path, "# External document");
    });
    expect(runtime.editor.replaceBlocks).toHaveBeenCalledTimes(1);

    releaseBackslash();
  });

  it("serializes every canonical same-path snapshot without reloading an earlier inactive representative", () => {
    const path = "C:/notes/shared.md";
    const windowsPath = "C:\\notes\\shared.md";
    let emitExternalChange: ((content: string) => void) | null = null;
    vi.spyOn(editorRuntime, "subscribeToEditorFile").mockImplementation(
      (_path, listener) => {
        emitExternalChange = listener;
        return vi.fn();
      },
    );
    const scheduleSave = vi.spyOn(editorSaveCoordinator, "schedule");
    useEditorStore.setState({
      activeGroupId: "group-2",
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-other",
          direction: "horizontal",
          tabs: [
            { ...createTab("tab-inactive", windowsPath), reloadKey: 5 },
            createTab("tab-other", "C:/notes/other.md"),
          ],
        },
        {
          id: "group-2",
          activeTabId: "tab-active-1",
          direction: "horizontal",
          tabs: [{ ...createTab("tab-active-1", path), reloadKey: 6 }],
        },
        {
          id: "group-3",
          activeTabId: "tab-active-2",
          direction: "horizontal",
          tabs: [{ ...createTab("tab-active-2", windowsPath), reloadKey: 7 }],
        },
      ],
    });
    const releaseFirst = richDocumentSessionManager.retainVisible(path, {
      paneKey: "group-2:tab-active-1",
      groupId: "group-2",
      tabId: "tab-active-1",
    });
    const releaseSecond = richDocumentSessionManager.retainVisible(
      windowsPath,
      {
        paneKey: "group-3:tab-active-2",
        groupId: "group-3",
        tabId: "tab-active-2",
      },
    );

    render(<RichDocumentSessionHost path={path} />);
    const runtime = sessionMocks.runtimes[0];
    runtime.editor.replaceBlocks.mockClear();

    act(() => {
      sessionMocks.controller?.onMarkdownChange("# Serialized document");
    });

    const serializedTabs = useEditorStore
      .getState()
      .panelGroups.flatMap((group) => group.tabs)
      .filter((tab) => tab.filePath?.replaceAll("\\", "/") === path);
    expect(serializedTabs.map((tab) => tab.content)).toEqual([
      "# Serialized document",
      "# Serialized document",
      "# Serialized document",
    ]);
    expect(serializedTabs.map((tab) => tab.wordCount)).toEqual([
      "# Serialized document".length,
      "# Serialized document".length,
      "# Serialized document".length,
    ]);
    expect(serializedTabs.map((tab) => tab.reloadKey)).toEqual([5, 6, 7]);
    expect(runtime.editor.replaceBlocks).not.toHaveBeenCalled();
    expect(scheduleSave).toHaveBeenCalledTimes(1);
    expect(scheduleSave).toHaveBeenCalledWith(path, "# Serialized document");

    act(() => {
      emitExternalChange?.("# External document");
    });
    expect(runtime.editor.replaceBlocks).toHaveBeenCalledTimes(1);

    releaseFirst();
    releaseSecond();
  });

  it("routes duplicate pane services through one document session", async () => {
    const path = "C:/notes/shared.md";
    let emitExternalChange: ((content: string) => void) | null = null;
    const subscribe = vi
      .spyOn(editorRuntime, "subscribeToEditorFile")
      .mockImplementation((_path, listener) => {
        emitExternalChange = listener;
        return vi.fn();
      });
    const registerFlusher = vi.spyOn(
      editorRuntime,
      "registerEditorChangeFlusher",
    );
    const scheduleSave = vi.spyOn(editorSaveCoordinator, "schedule");
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: createGroups(path),
    });
    const releaseFirst = richDocumentSessionManager.retainVisible(path, {
      paneKey: "group-1:tab-1",
      groupId: "group-1",
      tabId: "tab-1",
    });
    const releaseSecond = richDocumentSessionManager.retainVisible(path, {
      paneKey: "group-2:tab-2",
      groupId: "group-2",
      tabId: "tab-2",
    });

    render(<RichDocumentSessionHost path={path} />);

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(registerFlusher).toHaveBeenCalledTimes(2);
    const runtime = sessionMocks.runtimes[0];
    await act(async () => {
      await Promise.all([
        flushEditorChange("group-1", "tab-1"),
        flushEditorChange("group-2", "tab-2"),
      ]);
    });
    expect(runtime.serializePendingChange).toHaveBeenCalledTimes(1);
    expect(scheduleSave).toHaveBeenCalledTimes(1);

    runtime.editor.replaceBlocks.mockClear();
    act(() => {
      emitExternalChange?.("# External");
    });
    expect(runtime.editor.replaceBlocks).toHaveBeenCalledTimes(1);
    expect(
      useEditorStore
        .getState()
        .panelGroups.flatMap((group) => group.tabs)
        .map((tab) => tab.content),
    ).toEqual(["# External", "# External"]);

    releaseFirst();
    releaseSecond();
  });

  it("keeps one session when the representative binding changes for the same path", () => {
    const path = "C:/notes/large.md";
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: createGroups(path),
    });

    const view = render(<RichDocumentSessionHost path={path} />);
    const controller = sessionMocks.controller;
    expect(controller?.getActiveBinding()?.groupId).toBe("group-1");

    act(() => {
      useEditorStore.setState({ activeGroupId: "group-2" });
    });
    view.rerender(<RichDocumentSessionHost path={path} />);

    expect(sessionMocks.mounts.get(path)).toBe(1);
    expect(controller?.getActiveBinding()?.groupId).toBe("group-2");
    expect(richDocumentSessionManager.getRuntime(path)).not.toBeNull();

    act(() => {
      controller?.onWordCountChange(123);
      controller?.onParseStateChange("parse failed");
    });
    const [first, second] = useEditorStore
      .getState()
      .panelGroups.map((group) => group.tabs[0]);
    expect(first?.wordCount).toBe(7);
    expect(first?.parseErrorMessage).toBe("parse failed");
    expect(second?.wordCount).toBe(123);
    expect(second?.parseErrorMessage).toBe("parse failed");
    expect([first?.mode, second?.mode]).toEqual(["source", "source"]);

    view.unmount();
    expect(richDocumentSessionManager.getRuntime(path)).toBeNull();
  });

  it("syncs and saves every Windows-path tab through a normalized session path", async () => {
    const path = "C:\\notes\\shared.md";
    const sessionPath = "C:/notes/shared.md";
    const subscribeToFile = editorRuntime.subscribeToEditorFile;
    const subscribe = vi
      .spyOn(editorRuntime, "subscribeToEditorFile")
      .mockImplementation(subscribeToFile);
    let finishWrite: (() => void) | null = null;
    const writePromise = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        ...window.electronAPI,
        writeFile: vi.fn(() => writePromise),
      },
    });
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: createGroups(path),
    });
    const releaseFirst = richDocumentSessionManager.retainVisible(sessionPath, {
      paneKey: "group-1:tab-1",
      groupId: "group-1",
      tabId: "tab-1",
    });
    const releaseSecond = richDocumentSessionManager.retainVisible(
      sessionPath,
      {
        paneKey: "group-2:tab-2",
        groupId: "group-2",
        tabId: "tab-2",
      },
    );

    render(<RichDocumentSessionHost path={sessionPath} />);
    expect(subscribe).toHaveBeenCalledWith(path, expect.any(Function));
    act(() => {
      sessionMocks.controller?.onMarkdownChange("# Updated");
    });

    const tabs = useEditorStore
      .getState()
      .panelGroups.flatMap((group) => group.tabs);
    expect(tabs.map((tab) => tab.content)).toEqual(["# Updated", "# Updated"]);
    expect(tabs.map((tab) => tab.reloadKey)).toEqual([2, 2]);
    expect(tabs.map((tab) => tab.saveStatus)).toEqual(["dirty", "dirty"]);
    expect(editorSaveCoordinator.hasPending(path)).toBe(true);
    expect(editorSaveCoordinator.hasPending(sessionPath)).toBe(false);

    const flushPromise = editorSaveCoordinator.flush(path);
    expect(
      useEditorStore
        .getState()
        .panelGroups.flatMap((group) => group.tabs)
        .map((tab) => tab.saveStatus),
    ).toEqual(["saving", "saving"]);
    finishWrite?.();
    await act(async () => {
      await flushPromise;
    });
    expect(
      useEditorStore
        .getState()
        .panelGroups.flatMap((group) => group.tabs)
        .map((tab) => tab.saveStatus),
    ).toEqual(["clean", "clean"]);
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
      path,
      "# Updated",
    );

    releaseFirst();
    releaseSecond();
  });

  it("keeps one mounted session through a same-path reload", () => {
    const path = "C:/notes/reload.md";
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: createGroups(path),
    });

    render(<RichDocumentSessionHost path={path} />);
    const initialRuntime = richDocumentSessionManager.getRuntime(path);

    act(() => {
      setAllTabs({ loadStatus: "loading" });
    });
    expect(richDocumentSessionManager.getRuntime(path)).toBe(initialRuntime);

    act(() => {
      setAllTabs({
        content: "# Reloaded",
        loadStatus: "ready",
        reloadKey: 3,
      });
    });

    expect(sessionMocks.mounts.get(path)).toBe(1);
    expect(richDocumentSessionManager.getRuntime(path)).toBe(initialRuntime);
    expect(sessionMocks.reloads).toEqual([
      { content: "# Large", reloadKey: 2 },
      { content: "# Reloaded", reloadKey: 3 },
    ]);
  });

  it("waits for the initial ready document before mounting a session", () => {
    const path = "C:/notes/initial-loading.md";
    useEditorStore.setState({
      activeGroupId: "group-1",
      panelGroups: createGroups(path).map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => ({ ...tab, loadStatus: "loading" })),
      })),
    });

    render(<RichDocumentSessionHost path={path} />);
    expect(sessionMocks.mounts.get(path)).toBeUndefined();

    act(() => {
      setAllTabs({ loadStatus: "ready" });
    });
    expect(sessionMocks.mounts.get(path)).toBe(1);
  });
});

function setAllTabs(patch: Partial<EditorPanelGroup["tabs"][number]>): void {
  useEditorStore.setState((state) => ({
    panelGroups: state.panelGroups.map((group) => ({
      ...group,
      tabs: group.tabs.map((tab) => ({ ...tab, ...patch })),
    })),
  }));
}

function createGroups(path: string): EditorPanelGroup[] {
  return [
    {
      id: "group-1",
      activeTabId: "tab-1",
      direction: "horizontal",
      tabs: [createTab("tab-1", path)],
    },
    {
      id: "group-2",
      activeTabId: "tab-2",
      direction: "horizontal",
      tabs: [createTab("tab-2", path)],
    },
  ];
}

function createTab(id: string, path: string): EditorPanelGroup["tabs"][number] {
  return {
    id,
    filePath: path,
    pendingFilePath: null,
    content: "# Large",
    wordCount: 7,
    isDirty: false,
    reloadKey: 2,
    mode: "rich",
    loadStatus: "ready",
    saveStatus: "clean",
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
  };
}
