import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorPanelGroup } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";
import {
  editorSaveCoordinator,
  richDocumentSessionManager,
} from "../lib/editor-runtime";
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
  editor: object;
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
    useEffect(() => {
      sessionMocks.mounts.set(
        controller.path,
        (sessionMocks.mounts.get(controller.path) ?? 0) + 1,
      );
      sessionMocks.controller = controller;
      const runtime = {
        path: controller.path,
        surface,
        serializePendingChange: async () => undefined,
        cancelPendingWork: vi.fn(),
        destroy: vi.fn(),
        isDirty: () => false,
        isSaving: () => false,
        isReloading: () => false,
        editor: {},
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
    }, [content, reloadKey]);

    return null;
  },
}));

afterEach(() => {
  cleanup();
  sessionMocks.mounts.clear();
  sessionMocks.reloads.length = 0;
  sessionMocks.runtimes.length = 0;
  sessionMocks.controller = null;
  editorSaveCoordinator.cancel("C:/notes/shared.md");
  editorSaveCoordinator.cancel("C:\\notes\\shared.md");
});

describe("RichDocumentSessionHost", () => {
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
    expect(first?.parseErrorMessage).toBeNull();
    expect(second?.wordCount).toBe(123);
    expect(second?.parseErrorMessage).toBe("parse failed");

    view.unmount();
    expect(richDocumentSessionManager.getRuntime(path)).toBeNull();
  });

  it("syncs and saves every Windows-path tab through a normalized session path", async () => {
    const path = "C:\\notes\\shared.md";
    const sessionPath = "C:/notes/shared.md";
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
