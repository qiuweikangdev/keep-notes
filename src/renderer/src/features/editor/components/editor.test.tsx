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
  nextInstanceId: 0,
  mounts: new Map<string, number>(),
  unmounts: new Map<string, number>(),
}));

vi.mock("./editor-workspace", async () => {
  const { useEffect, useState } = await import("react");

  return {
    EditorWorkspace: ({ groupId }: { groupId: string }) => {
      const [instanceId] = useState(() => {
        workspaceLifecycle.nextInstanceId += 1;
        return workspaceLifecycle.nextInstanceId;
      });

      useEffect(() => {
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
      }, [groupId]);

      return (
        <div data-testid={`workspace-${groupId}`} data-instance-id={instanceId}>
          workspace-{groupId}
        </div>
      );
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
  workspaceLifecycle.nextInstanceId = 0;
  workspaceLifecycle.mounts.clear();
  workspaceLifecycle.unmounts.clear();
});

afterEach(() => {
  cleanup();
});

describe("Editor split panels", () => {
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
});
