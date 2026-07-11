import type { CSSProperties, PropsWithChildren } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editor.store";
import { Editor } from "./editor";

vi.mock("react-resizable-panels", () => ({
  Panel: ({ children }: PropsWithChildren) => <div>{children}</div>,
  PanelGroup: ({
    children,
    direction,
  }: PropsWithChildren<{ direction: "horizontal" | "vertical" }>) => (
    <div data-testid={`panel-group-${direction}`}>{children}</div>
  ),
  PanelResizeHandle: ({ style }: { style?: CSSProperties }) => (
    <div data-testid="panel-resize-handle" style={style} />
  ),
}));

vi.mock("./editor-tab-bar", () => ({
  EditorTabBar: ({ groupId }: { groupId: string }) => (
    <div>tab-bar-{groupId}</div>
  ),
}));

const workspaceLifecycle = vi.hoisted(() => ({
  renderRichPanes: false,
  nextInstanceId: 0,
  instances: new Map<string, number>(),
  mounts: new Map<string, number>(),
  unmounts: new Map<string, number>(),
}));

const richSessionLifecycle = vi.hoisted(() => ({
  mounts: new Map<string, number>(),
}));

vi.mock("./editor-workspace", async () => {
  const { useEffect, useState } = await import("react");
  const { useEditorStore: editorStoreHook } =
    await import("@/store/editor.store");
  const { RichDocumentPane } = await import("./rich-document-pane");

  function RichPaneWorkspace({
    groupId,
    tabId,
  }: {
    groupId: string;
    tabId: string;
  }) {
    const tab = editorStoreHook
      .getState()
      .panelGroups.find((group) => group.id === groupId)
      ?.tabs.find((candidate) => candidate.id === tabId);
    return tab?.filePath ? (
      <RichDocumentPane groupId={groupId} path={tab.filePath} tabId={tabId} />
    ) : null;
  }

  function LifecycleWorkspace({ groupId }: { groupId: string }) {
    const [instanceId] = useState(() => {
      workspaceLifecycle.nextInstanceId += 1;
      return workspaceLifecycle.nextInstanceId;
    });

    useEffect(() => {
      workspaceLifecycle.instances.set(groupId, instanceId);
      workspaceLifecycle.mounts.set(
        groupId,
        (workspaceLifecycle.mounts.get(groupId) ?? 0) + 1,
      );
      return () => {
        workspaceLifecycle.unmounts.set(
          groupId,
          (workspaceLifecycle.unmounts.get(groupId) ?? 0) + 1,
        );
      };
    }, [groupId, instanceId]);

    return (
      <div data-testid={`workspace-${groupId}`} data-instance-id={instanceId}>
        workspace-{groupId}
      </div>
    );
  }

  return {
    EditorWorkspace: ({
      groupId,
      tabId,
    }: {
      groupId: string;
      tabId: string;
    }) => {
      if (workspaceLifecycle.renderRichPanes) {
        return <RichPaneWorkspace groupId={groupId} tabId={tabId} />;
      }
      return <LifecycleWorkspace groupId={groupId} />;
    },
  };
});

vi.mock("./virtual-rich-preview", () => ({
  VirtualRichPreview: () => <div data-testid="virtual-rich-preview" />,
}));

vi.mock("./rich-document-session-host", async () => {
  const { useLayoutEffect } = await import("react");
  const { richDocumentSessionManager } = await import("../lib/editor-runtime");

  return {
    RichDocumentSessionHost: ({ path }: { path: string }) => {
      useLayoutEffect(() => {
        richSessionLifecycle.mounts.set(
          path,
          (richSessionLifecycle.mounts.get(path) ?? 0) + 1,
        );
        return richDocumentSessionManager.registerRuntime(path, {
          path,
          surface: document.createElement("div"),
          serializePendingChange: async () => undefined,
          cancelPendingWork: vi.fn(),
          destroy: vi.fn(),
          isDirty: () => false,
          isSaving: () => false,
          isReloading: () => false,
          previewCache: {},
          readViewState: () => ({ scrollTop: 0, selection: null }),
          restoreViewState: vi.fn(),
        });
      }, [path]);
      return null;
    },
  };
});

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    openFile: vi.fn(),
  }),
}));

function createTab(id: string, filePath: string) {
  return {
    id,
    filePath,
    pendingFilePath: null,
    content: "",
    wordCount: 0,
    isDirty: false,
    reloadKey: 0,
    mode: "rich" as const,
    loadStatus: "ready" as const,
    saveStatus: "clean" as const,
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
  };
}

beforeEach(() => {
  workspaceLifecycle.renderRichPanes = false;
  workspaceLifecycle.nextInstanceId = 0;
  workspaceLifecycle.instances.clear();
  workspaceLifecycle.mounts.clear();
  workspaceLifecycle.unmounts.clear();
  richSessionLifecycle.mounts.clear();
});

afterEach(() => {
  cleanup();
});

describe("Editor split panels", () => {
  it.each([2, 3, 6])(
    "shares one session host across %i same-path rich panes",
    (panelCount) => {
      const path = "C:/notes/large.md";
      workspaceLifecycle.renderRichPanes = true;
      useEditorStore.setState({
        panelGroups: createSamePathGroups(panelCount, path),
        activeGroupId: "group-1",
      });

      render(<Editor />);

      expect(richSessionLifecycle.mounts.get(path)).toBe(1);
      expect(screen.getAllByTestId("rich-document-pane")).toHaveLength(
        panelCount,
      );
      expect(screen.getAllByTestId("virtual-rich-preview")).toHaveLength(
        panelCount - 1,
      );
      expect(screen.getAllByTestId("rich-document-live-host")).toHaveLength(1);
    },
  );

  it("does not remount the same-path session host when splitting from two to three panes", () => {
    const path = "C:/notes/large.md";
    workspaceLifecycle.renderRichPanes = true;
    useEditorStore.setState({
      panelGroups: createSamePathGroups(2, path),
      activeGroupId: "group-1",
    });

    render(<Editor />);
    expect(richSessionLifecycle.mounts.get(path)).toBe(1);

    act(() => {
      useEditorStore.setState({
        panelGroups: createSamePathGroups(3, path),
      });
    });

    expect(richSessionLifecycle.mounts.get(path)).toBe(1);
    expect(screen.getAllByTestId("rich-document-pane")).toHaveLength(3);
    expect(screen.getAllByTestId("virtual-rich-preview")).toHaveLength(2);
  });

  it("uses a horizontal resize handle for vertical down splits", () => {
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [createTab("tab-1", "/notes/auth.md")],
        },
        {
          id: "group-2",
          activeTabId: "tab-2",
          direction: "vertical",
          tabs: [createTab("tab-2", "/notes/aaa.md")],
        },
      ],
      activeGroupId: "group-2",
    });

    render(<Editor />);

    expect(screen.getByTestId("panel-group-vertical")).toBeInTheDocument();
    const handle = screen.getByTestId("panel-resize-handle");
    expect(handle).toHaveStyle({
      height: "6px",
      minHeight: "6px",
      cursor: "row-resize",
    });
    expect(handle.getAttribute("style")).toContain("border-left: 0");
    expect(handle.getAttribute("style")).toContain(
      "border-top: 1px solid var(--border-color)",
    );
  });

  it("keeps the bottom panel below when splitting only the top panel to the right", () => {
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [createTab("tab-1", "/notes/top.md")],
        },
        {
          id: "group-2",
          activeTabId: "tab-2",
          direction: "vertical",
          splitParentGroupId: "group-1",
          tabs: [createTab("tab-2", "/notes/bottom.md")],
        },
        {
          id: "group-3",
          activeTabId: "tab-3",
          direction: "horizontal",
          splitParentGroupId: "group-1",
          tabs: [createTab("tab-3", "/notes/right.md")],
        },
      ],
      activeGroupId: "group-3",
    });

    render(<Editor />);

    const verticalGroup = screen.getByTestId("panel-group-vertical");
    const horizontalGroup = screen.getByTestId("panel-group-horizontal");

    expect(verticalGroup.firstElementChild).toContainElement(horizontalGroup);
    expect(horizontalGroup).toHaveTextContent("tab-bar-group-1");
    expect(horizontalGroup).toHaveTextContent("tab-bar-group-3");
    expect(horizontalGroup).not.toHaveTextContent("tab-bar-group-2");
  });

  it("keeps surviving editor instances mounted through nested split and close", () => {
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [createTab("tab-1", "/notes/large.md")],
        },
        {
          id: "group-2",
          activeTabId: "tab-2",
          direction: "horizontal",
          splitParentGroupId: "group-1",
          tabs: [createTab("tab-2", "/notes/large.md")],
        },
      ],
      activeGroupId: "group-1",
    });

    render(<Editor />);
    const firstInstance = screen
      .getByTestId("workspace-group-1")
      .getAttribute("data-instance-id");
    const secondInstance = screen
      .getByTestId("workspace-group-2")
      .getAttribute("data-instance-id");

    act(() => {
      useEditorStore.getState().addPanelGroup("vertical", "group-2");
    });

    const addedGroup = useEditorStore
      .getState()
      .panelGroups.find((group) => !["group-1", "group-2"].includes(group.id));
    expect(addedGroup).toBeDefined();
    expect(
      screen.getByTestId("workspace-group-1").getAttribute("data-instance-id"),
    ).toBe(firstInstance);
    expect(
      screen.getByTestId("workspace-group-2").getAttribute("data-instance-id"),
    ).toBe(secondInstance);

    act(() => {
      useEditorStore
        .getState()
        .removeTab(addedGroup!.id, addedGroup!.activeTabId);
    });

    expect(
      screen.getByTestId("workspace-group-1").getAttribute("data-instance-id"),
    ).toBe(firstInstance);
    expect(
      screen.getByTestId("workspace-group-2").getAttribute("data-instance-id"),
    ).toBe(secondInstance);
    expect(workspaceLifecycle.mounts.get("group-1")).toBe(1);
    expect(workspaceLifecycle.mounts.get("group-2")).toBe(1);
    expect(workspaceLifecycle.unmounts.get("group-1") ?? 0).toBe(0);
    expect(workspaceLifecycle.unmounts.get("group-2") ?? 0).toBe(0);
  });

  it("keeps a split warmup hidden and reveals the same mounted instance when claimed", () => {
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [createTab("tab-1", "/notes/large.md")],
        },
        {
          id: "group-warmup",
          activeTabId: "tab-warmup",
          direction: "horizontal",
          tabs: [createTab("tab-warmup", "/notes/large.md")],
          splitWarmup: {
            sourceGroupId: "group-1",
            sourceTabId: "tab-1",
            status: "ready",
          },
        },
      ],
      activeGroupId: "group-1",
    });

    render(<Editor />);

    expect(workspaceLifecycle.mounts.get("group-warmup")).toBe(1);
    expect(screen.queryByTestId("workspace-group-warmup")).toBeNull();
    const warmupInstance = workspaceLifecycle.instances.get("group-warmup");

    act(() => {
      useEditorStore.getState().addPanelGroup("horizontal", "group-1");
    });

    expect(
      screen
        .getByTestId("workspace-group-warmup")
        .getAttribute("data-instance-id"),
    ).toBe(String(warmupInstance));
    expect(workspaceLifecycle.mounts.get("group-warmup")).toBe(1);
    expect(workspaceLifecycle.unmounts.get("group-warmup") ?? 0).toBe(0);
  });
});

function createSamePathGroups(panelCount: number, path: string) {
  return Array.from({ length: panelCount }, (_, index) => {
    const number = index + 1;
    return {
      id: `group-${number}`,
      activeTabId: `tab-${number}`,
      direction: "horizontal" as const,
      splitParentGroupId: index === 0 ? undefined : "group-1",
      tabs: [createTab(`tab-${number}`, path)],
    };
  });
}
