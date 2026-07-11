import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorPanelGroup } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";
import { richDocumentSessionManager } from "../lib/editor-runtime";
import { RichDocumentSessionHost } from "./rich-document-session-host";

const sessionMocks = vi.hoisted(() => ({
  mounts: new Map<string, number>(),
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
    controller,
    surface,
  }: {
    controller: NonNullable<typeof sessionMocks.controller>;
    surface: HTMLElement;
  }) => {
    useEffect(() => {
      sessionMocks.mounts.set(
        controller.path,
        (sessionMocks.mounts.get(controller.path) ?? 0) + 1,
      );
      sessionMocks.controller = controller;
      return controller.onRuntimeReady({
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
      });
    }, [controller, surface]);

    return null;
  },
}));

afterEach(() => {
  cleanup();
  sessionMocks.mounts.clear();
  sessionMocks.controller = null;
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

  it("syncs every bound same-path tab without incrementing reload keys", () => {
    const path = "C:/notes/shared.md";
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
    act(() => {
      sessionMocks.controller?.onMarkdownChange("# Updated");
    });

    const tabs = useEditorStore
      .getState()
      .panelGroups.flatMap((group) => group.tabs);
    expect(tabs.map((tab) => tab.content)).toEqual(["# Updated", "# Updated"]);
    expect(tabs.map((tab) => tab.reloadKey)).toEqual([2, 2]);

    releaseFirst();
    releaseSecond();
  });
});

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
