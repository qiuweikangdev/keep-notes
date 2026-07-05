import type { CSSProperties, PropsWithChildren } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

vi.mock("./editor-workspace", () => ({
  EditorWorkspace: ({ groupId }: { groupId: string }) => (
    <div>workspace-{groupId}</div>
  ),
}));

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
});
