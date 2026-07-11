import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditorStore } from "@/store/editor.store";
import {
  richDocumentSessionManager,
  richPaneViewStateRegistry,
} from "../lib/editor-runtime";
import type { RichPreviewAnchor } from "../lib/rich-preview-anchor";
import { RichDocumentPane } from "./rich-document-pane";

vi.mock("./virtual-rich-preview", () => ({
  VirtualRichPreview: ({
    paneKey,
    onActivate,
  }: {
    paneKey: string;
    onActivate: (anchor: RichPreviewAnchor | null) => void;
  }) => (
    <button
      data-pane-key={paneKey}
      data-testid="virtual-rich-preview"
      onPointerDown={() => onActivate({ blockId: "block-a", textOffset: 3 })}
      type="button"
    >
      preview
    </button>
  ),
}));

const path = "C:/notes/task-7-pane.md";

beforeEach(() => {
  useEditorStore.setState({
    activeGroupId: "group-1",
    panelGroups: [
      createGroup("group-1", "tab-1"),
      createGroup("group-2", "tab-2"),
    ],
  });
});

afterEach(() => {
  cleanup();
  richPaneViewStateRegistry.clear();
});

describe("RichDocumentPane", () => {
  it("rerenders and activates before paint when its runtime becomes ready", () => {
    render(<RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />);

    expect(screen.getByTestId("editor-loading-skeleton")).toBeInTheDocument();
    expect(richDocumentSessionManager.getVisiblePaneKeys(path)).toEqual([
      "group-1:tab-1",
    ]);

    const runtime = createRuntime(path);
    let unregisterRuntime: (() => void) | undefined;
    act(() => {
      unregisterRuntime = richDocumentSessionManager.registerRuntime(
        path,
        runtime,
      );
    });

    expect(screen.queryByTestId("editor-loading-skeleton")).toBeNull();
    expect(screen.getByTestId("rich-document-live-host")).toContainElement(
      runtime.surface,
    );
    expect(richDocumentSessionManager.getActivePane(path)).toBe(
      "group-1:tab-1",
    );
    expect(runtime.restoreViewState).toHaveBeenCalledTimes(1);

    act(() => unregisterRuntime?.());
    expect(screen.getByTestId("editor-loading-skeleton")).toBeInTheDocument();
  });

  it("moves the one live surface on active keyboard or tab switches", () => {
    render(
      <>
        <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />
        <RichDocumentPane groupId="group-2" tabId="tab-2" path={path} />
      </>,
    );
    const runtime = createRuntime(path);
    let unregisterRuntime: (() => void) | undefined;
    act(() => {
      unregisterRuntime = richDocumentSessionManager.registerRuntime(
        path,
        runtime,
      );
    });

    expect(screen.getAllByTestId("rich-document-live-host")).toHaveLength(1);
    expect(screen.getAllByTestId("virtual-rich-preview")).toHaveLength(1);

    act(() => {
      useEditorStore.getState().setActiveTab("group-2", "tab-2");
    });

    const secondPane = screen
      .getAllByTestId("rich-document-pane")
      .find((pane) => pane.dataset.paneKey === "group-2:tab-2");
    expect(secondPane).toBeDefined();
    expect(
      within(secondPane!).getByTestId("rich-document-live-host"),
    ).toContainElement(runtime.surface);
    expect(richDocumentSessionManager.getActivePane(path)).toBe(
      "group-2:tab-2",
    );
    expect(runtime.readViewState).toHaveBeenCalledTimes(1);

    const firstPreview = screen.getByTestId("virtual-rich-preview");
    fireEvent.pointerDown(firstPreview);
    expect(useEditorStore.getState().activeGroupId).toBe("group-1");
    expect(richDocumentSessionManager.getActivePane(path)).toBe(
      "group-1:tab-1",
    );

    act(() => unregisterRuntime?.());
  });

  it("releases its identity-scoped binding and view state on close", () => {
    richPaneViewStateRegistry.patch("group-1:tab-1", { scrollTop: 240 });
    const view = render(
      <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />,
    );

    view.unmount();

    expect(richDocumentSessionManager.getVisiblePaneKeys(path)).toEqual([]);
    expect(richPaneViewStateRegistry.read("group-1:tab-1").scrollTop).toBe(0);
  });

  it("replaces the binding and host identity when the visible tab changes", () => {
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) =>
        group.id === "group-1"
          ? {
              ...group,
              tabs: [...group.tabs, createGroup("group-1", "tab-next").tabs[0]],
            }
          : group,
      ),
    }));
    const view = render(
      <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />,
    );
    const runtime = createRuntime(path);
    let unregisterRuntime: (() => void) | undefined;
    act(() => {
      unregisterRuntime = richDocumentSessionManager.registerRuntime(
        path,
        runtime,
      );
    });
    richPaneViewStateRegistry.patch("group-1:tab-1", { scrollTop: 320 });

    act(() => {
      useEditorStore.getState().setActiveTab("group-1", "tab-next");
      view.rerender(
        <RichDocumentPane groupId="group-1" tabId="tab-next" path={path} />,
      );
    });

    expect(richDocumentSessionManager.getVisiblePaneKeys(path)).toEqual([
      "group-1:tab-next",
    ]);
    expect(richDocumentSessionManager.getActivePane(path)).toBe(
      "group-1:tab-next",
    );
    expect(richPaneViewStateRegistry.read("group-1:tab-1").scrollTop).toBe(0);
    expect(screen.getByTestId("rich-document-live-host")).toContainElement(
      runtime.surface,
    );

    act(() => unregisterRuntime?.());
  });
});

function createRuntime(runtimePath: string) {
  return {
    path: runtimePath,
    surface: document.createElement("div"),
    serializePendingChange: vi.fn(async () => undefined),
    cancelPendingWork: vi.fn(),
    destroy: vi.fn(),
    isDirty: () => false,
    isSaving: () => false,
    isReloading: () => false,
    editor: {},
    previewCache: {},
    focusAt: vi.fn(),
    readViewState: vi.fn(() => ({ scrollTop: 18, selection: null })),
    restoreViewState: vi.fn(),
    scrollToBlock: vi.fn(() => false),
  };
}

function createGroup(id: string, tabId: string) {
  return {
    id,
    activeTabId: tabId,
    direction: "horizontal" as const,
    tabs: [
      {
        id: tabId,
        filePath: path,
        pendingFilePath: null,
        content: "# Large",
        wordCount: 1,
        isDirty: false,
        reloadKey: 0,
        mode: "rich" as const,
        loadStatus: "ready" as const,
        saveStatus: "clean" as const,
        errorMessage: null,
        parseErrorMessage: null,
        scrollTop: 0,
      },
    ],
  };
}
