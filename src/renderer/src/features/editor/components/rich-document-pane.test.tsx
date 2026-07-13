import { StrictMode } from "react";
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
  richDocumentSurfaceRegistry,
  richPaneViewStateRegistry,
} from "../lib/editor-runtime";
import {
  resolveRichPreviewAnchor,
  type RichPreviewAnchor,
} from "../lib/rich-preview-anchor";
import { RichDocumentPane } from "./rich-document-pane";

const editorPerformanceMocks = vi.hoisted(() => ({
  activationSamples: [] as string[],
  commitPane: vi.fn(() => vi.fn()),
  measure: vi.fn(
    <T,>(
      operation: string,
      callback: () => T,
      shouldRecord?: (value: T) => boolean,
    ) => {
      const result = callback();
      if (!shouldRecord || shouldRecord(result)) {
        editorPerformanceMocks.activationSamples.push(operation);
      }
      return result;
    },
  ),
}));

vi.mock("../lib/editor-performance", () => ({
  editorSplitPaintCoordinator: {
    commitPane: editorPerformanceMocks.commitPane,
  },
  measureEditorOperation: editorPerformanceMocks.measure,
}));

vi.mock("./virtual-rich-preview", () => ({
  VirtualRichPreview: ({
    paneKey,
    onActivate,
  }: {
    paneKey: string;
    onActivate: (anchor: RichPreviewAnchor | null) => void;
  }) => (
    <div
      data-pane-key={paneKey}
      data-testid="virtual-rich-preview"
      onPointerDown={(event) => {
        const eventTarget = event.target as Node;
        const target =
          eventTarget instanceof Element && eventTarget.textContent === "world"
            ? (eventTarget.firstChild ?? eventTarget)
            : eventTarget;
        const offset = target.textContent === "world" ? 3 : 0;
        onActivate(resolveRichPreviewAnchor(target, offset));
      }}
      role="textbox"
    >
      <div data-block-id="block-a">
        <p>
          <span>Hello </span>
          <strong>world</strong>
          <img alt="unsupported" />
        </p>
      </div>
    </div>
  ),
}));

const path = "C:/notes/task-7-pane.md";

function getPane(paneKey: string): HTMLElement {
  return screen
    .getAllByTestId("rich-document-pane")
    .find((pane) => pane.dataset.paneKey === paneKey)!;
}

beforeEach(() => {
  editorPerformanceMocks.activationSamples.length = 0;
  editorPerformanceMocks.commitPane.mockClear();
  editorPerformanceMocks.measure.mockClear();
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
  document.body.replaceChildren();
  richPaneViewStateRegistry.clear();
  vi.restoreAllMocks();
});

describe("RichDocumentPane", () => {
  it("moves, restores, activates, and focuses a passive pane on its first pointer-down", () => {
    render(
      <>
        <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />
        <RichDocumentPane groupId="group-2" tabId="tab-2" path={path} />
      </>,
    );
    const runtime = createRuntime(path);
    const outgoingSelection = {
      anchorBlockId: "block-outgoing",
      anchorOffset: 2,
      headBlockId: "block-outgoing",
      headOffset: 7,
    };
    runtime.readViewState.mockReturnValue({
      scrollTop: 320,
      selection: outgoingSelection,
    });
    let unregisterRuntime: (() => void) | undefined;
    act(() => {
      unregisterRuntime = richDocumentSessionManager.registerRuntime(
        path,
        runtime,
      );
    });
    expect(editorPerformanceMocks.commitPane).toHaveBeenCalledWith("group-2");
    richPaneViewStateRegistry.patch("group-2:tab-2", { scrollTop: 640 });
    runtime.readViewState.mockClear();
    runtime.restoreViewState.mockClear();
    runtime.focusAt.mockClear();

    const order: string[] = [];
    runtime.readViewState.mockImplementation(() => {
      order.push("capture");
      return { scrollTop: 320, selection: outgoingSelection };
    });
    const originalActivate = richDocumentSurfaceRegistry.activate.bind(
      richDocumentSurfaceRegistry,
    );
    vi.spyOn(richDocumentSurfaceRegistry, "activate").mockImplementation(
      (...args) => {
        order.push("surface");
        return originalActivate(...args);
      },
    );
    runtime.restoreViewState.mockImplementation(() => order.push("restore"));
    runtime.focusAt.mockImplementation(() => order.push("focus"));
    const store = useEditorStore.getState();
    const originalSetActiveGroupId = store.setActiveGroupId;
    const originalSetActiveTab = store.setActiveTab;
    vi.spyOn(store, "setActiveGroupId").mockImplementation((groupId) => {
      order.push("group");
      originalSetActiveGroupId(groupId);
    });
    vi.spyOn(store, "setActiveTab").mockImplementation((groupId, tabId) => {
      order.push("tab");
      originalSetActiveTab(groupId, tabId);
    });

    fireEvent.pointerDown(
      within(getPane("group-2:tab-2")).getByText("world").firstChild!,
      {
        clientX: 40,
        clientY: 20,
      },
    );

    expect(editorPerformanceMocks.measure).toHaveBeenCalledWith(
      "editor:pane-activate",
      expect.any(Function),
      Boolean,
    );
    expect(editorPerformanceMocks.activationSamples).toEqual([
      "editor:pane-activate",
    ]);

    const activeSurfacePane =
      richDocumentSurfaceRegistry.getActivePaneKey(path);
    const activeManagerPane = richDocumentSessionManager.getActivePane(path);
    const surfaceActivePane = runtime.surface.dataset.activePaneKey;
    const outgoingState = richPaneViewStateRegistry.read("group-1:tab-1");
    const restoreCalls = runtime.restoreViewState.mock.calls.map(([state]) =>
      structuredClone(state),
    );
    const focusCalls = runtime.focusAt.mock.calls.map(([anchor]) => anchor);
    const activeGroupId = useEditorStore.getState().activeGroupId;
    const activationOrder = [...order];
    act(() => unregisterRuntime?.());

    expect(activeSurfacePane).toBe("group-2:tab-2");
    expect(activeManagerPane).toBe("group-2:tab-2");
    expect(surfaceActivePane).toBe("group-2:tab-2");
    expect(outgoingState).toEqual(
      expect.objectContaining({
        scrollTop: 320,
        selection: outgoingSelection,
      }),
    );
    expect(restoreCalls).toEqual([expect.objectContaining({ scrollTop: 640 })]);
    expect(focusCalls).toEqual([
      {
        blockId: "block-a",
        textOffset: 9,
      },
    ]);
    expect(activeGroupId).toBe("group-2");
    expect(activationOrder).toEqual([
      "capture",
      "surface",
      "restore",
      "tab",
      "focus",
    ]);
  });

  it("focuses unsupported preview content at block offset zero", () => {
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
    runtime.focusAt.mockClear();

    fireEvent.pointerDown(
      within(getPane("group-2:tab-2")).getByAltText("unsupported"),
    );

    const focusCalls = runtime.focusAt.mock.calls.map(([anchor]) => anchor);
    act(() => unregisterRuntime?.());
    expect(focusCalls).toContainEqual({
      blockId: "block-a",
      textOffset: 0,
    });
  });

  it("does not switch store ownership or focus when the surface move fails", () => {
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
    runtime.focusAt.mockClear();
    vi.spyOn(richDocumentSessionManager, "setActivePane").mockReturnValue(
      false,
    );

    fireEvent.pointerDown(
      within(getPane("group-2:tab-2")).getByText("world").firstChild!,
    );

    const activeGroupId = useEditorStore.getState().activeGroupId;
    const focusCalls = runtime.focusAt.mock.calls.length;
    act(() => unregisterRuntime?.());
    expect(activeGroupId).toBe("group-1");
    expect(focusCalls).toBe(0);
    expect(editorPerformanceMocks.activationSamples).not.toContain(
      "editor:pane-activate",
    );
  });

  it("rerenders and activates before paint when its runtime becomes ready", () => {
    render(<RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />);

    expect(screen.queryByTestId("editor-loading-skeleton")).toBeNull();
    expect(screen.getByTestId("editor-pending-canvas")).toBeInTheDocument();
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

    expect(screen.queryByTestId("editor-pending-canvas")).toBeNull();
    expect(runtime.surface.parentElement).toBe(document.body);
    expect(runtime.surface.dataset.activePaneKey).toBe("group-1:tab-1");
    expect(richDocumentSessionManager.getActivePane(path)).toBe(
      "group-1:tab-1",
    );
    expect(runtime.restoreViewState).toHaveBeenCalledTimes(1);

    act(() => unregisterRuntime?.());
    expect(screen.queryByTestId("editor-loading-skeleton")).toBeNull();
    expect(screen.getByTestId("virtual-rich-preview")).toBeInTheDocument();
  });

  it("keeps the outgoing rich document visible until the next file runtime is ready", () => {
    const nextPath = "C:/notes/next.md";
    const view = render(
      <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />,
    );
    const outgoingRuntime = createRuntime(path);
    const nextRuntime = createRuntime(nextPath);
    let unregisterOutgoing: (() => void) | undefined;
    let unregisterNext: (() => void) | undefined;
    act(() => {
      unregisterOutgoing = richDocumentSessionManager.registerRuntime(
        path,
        outgoingRuntime,
      );
    });

    view.rerender(
      <RichDocumentPane groupId="group-1" tabId="tab-1" path={nextPath} />,
    );

    expect(screen.queryByTestId("editor-loading-skeleton")).toBeNull();
    expect(outgoingRuntime.surface.style.visibility).toBe("visible");
    expect(outgoingRuntime.surface.dataset.activePaneKey).toBe("group-1:tab-1");
    expect(richDocumentSessionManager.getVisiblePaneKeys(path)).toEqual([
      "group-1:tab-1",
    ]);
    expect(richDocumentSessionManager.getVisiblePaneKeys(nextPath)).toEqual([
      "group-1:tab-1",
    ]);

    act(() => {
      unregisterNext = richDocumentSessionManager.registerRuntime(
        nextPath,
        nextRuntime,
      );
    });

    expect(nextRuntime.surface.dataset.activePaneKey).toBe("group-1:tab-1");
    expect(outgoingRuntime.surface.style.visibility).toBe("hidden");
    expect(richDocumentSessionManager.getVisiblePaneKeys(path)).toEqual([]);
    expect(richDocumentSessionManager.getVisiblePaneKeys(nextPath)).toEqual([
      "group-1:tab-1",
    ]);

    act(() => unregisterNext?.());
    unregisterOutgoing?.();
  });

  it("reactivates replacement and recovered runtimes with the latest state once", () => {
    render(<RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />);
    const firstRuntime = createRuntime(path);
    const secondRuntime = createRuntime(path);
    const recoveredRuntime = createRuntime(path);
    firstRuntime.readViewState.mockReturnValue({
      scrollTop: 73,
      selection: null,
    });
    secondRuntime.readViewState.mockReturnValue({
      scrollTop: 91,
      selection: null,
    });
    let unregisterFirst: (() => void) | undefined;
    let unregisterSecond: (() => void) | undefined;
    let unregisterRecovered: (() => void) | undefined;

    act(() => {
      unregisterFirst = richDocumentSessionManager.registerRuntime(
        path,
        firstRuntime,
      );
    });
    act(() => {
      unregisterSecond = richDocumentSessionManager.registerRuntime(
        path,
        secondRuntime,
      );
    });

    expect(firstRuntime.readViewState).toHaveBeenCalledTimes(1);
    expect(firstRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(secondRuntime.surface.parentElement).not.toBeNull();
    expect(secondRuntime.restoreViewState).toHaveBeenCalledTimes(1);
    expect(secondRuntime.restoreViewState).toHaveBeenCalledWith(
      expect.objectContaining({ scrollTop: 73 }),
    );

    unregisterFirst?.();
    expect(secondRuntime.surface.parentElement).not.toBeNull();
    expect(secondRuntime.restoreViewState).toHaveBeenCalledTimes(1);

    act(() => unregisterSecond?.());
    expect(secondRuntime.surface.parentElement).toBeNull();
    expect(screen.queryByTestId("editor-loading-skeleton")).toBeNull();
    expect(screen.getByTestId("virtual-rich-preview")).toBeInTheDocument();

    act(() => {
      unregisterRecovered = richDocumentSessionManager.registerRuntime(
        path,
        recoveredRuntime,
      );
    });
    expect(recoveredRuntime.surface.parentElement).not.toBeNull();
    expect(recoveredRuntime.restoreViewState).toHaveBeenCalledTimes(1);
    expect(recoveredRuntime.restoreViewState).toHaveBeenCalledWith(
      expect.objectContaining({ scrollTop: 91 }),
    );

    act(() => unregisterRecovered?.());
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
    expect(screen.getAllByTestId("virtual-rich-preview")).toHaveLength(2);
    const firstPane = screen
      .getAllByTestId("rich-document-pane")
      .find((pane) => pane.dataset.paneKey === "group-1:tab-1")!;
    expect(within(firstPane).getByTestId("rich-preview-layer")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    act(() => {
      useEditorStore.getState().setActiveTab("group-2", "tab-2");
    });

    const secondPane = screen
      .getAllByTestId("rich-document-pane")
      .find((pane) => pane.dataset.paneKey === "group-2:tab-2");
    expect(secondPane).toBeDefined();
    expect(
      within(secondPane!).getByTestId("rich-document-live-host"),
    ).toBeEmptyDOMElement();
    expect(runtime.surface.parentElement).toBe(document.body);
    expect(runtime.surface.dataset.activePaneKey).toBe("group-2:tab-2");
    expect(richDocumentSessionManager.getActivePane(path)).toBe(
      "group-2:tab-2",
    );
    expect(runtime.readViewState).toHaveBeenCalledTimes(1);

    const firstPreview = within(firstPane).getByTestId("virtual-rich-preview");
    fireEvent.pointerDown(firstPreview);
    expect(useEditorStore.getState().activeGroupId).toBe("group-1");
    expect(richDocumentSessionManager.getActivePane(path)).toBe(
      "group-1:tab-1",
    );

    act(() => unregisterRuntime?.());
  });

  it("keeps the active pane preview painted below the live surface", () => {
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

    const activePane = getPane("group-1:tab-1");
    const activePreviewLayer =
      within(activePane).getByTestId("rich-preview-layer");
    expect(activePreviewLayer).toHaveAttribute("aria-hidden", "true");
    expect(activePreviewLayer).toHaveStyle({
      pointerEvents: "none",
      visibility: "visible",
    });

    act(() => unregisterRuntime?.());
  });

  it("hides the outgoing surface for an inactive pending target without showing loading", () => {
    const secondPath = "C:/notes/loading.md";
    const view = render(
      <>
        <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />
        <RichDocumentPane groupId="group-2" tabId="tab-2" path={secondPath} />
      </>,
    );
    const firstRuntime = createRuntime(path);
    const secondRuntime = createRuntime(secondPath);
    let unregisterFirst: (() => void) | undefined;
    act(() => {
      unregisterFirst = richDocumentSessionManager.registerRuntime(
        path,
        firstRuntime,
      );
    });
    const firstPane = screen
      .getAllByTestId("rich-document-pane")
      .find((pane) => pane.dataset.paneKey === "group-1:tab-1")!;
    const secondPane = screen
      .getAllByTestId("rich-document-pane")
      .find((pane) => pane.dataset.paneKey === "group-2:tab-2")!;
    expect(firstRuntime.surface.parentElement).not.toBeNull();

    act(() => {
      useEditorStore.getState().setActiveTab("group-2", "tab-2");
    });

    expect(firstRuntime.surface.parentElement).toBe(document.body);
    expect(firstRuntime.surface.style.visibility).toBe("hidden");
    expect(richDocumentSessionManager.getActiveBinding()).toBeNull();
    expect(within(firstPane).getByTestId("virtual-rich-preview")).toBeVisible();
    expect(
      within(secondPane).queryByTestId("editor-loading-skeleton"),
    ).toBeNull();
    expect(
      within(secondPane).getByTestId("editor-pending-canvas"),
    ).toBeVisible();

    let unregisterSecond: (() => void) | undefined;
    act(() => {
      unregisterSecond = richDocumentSessionManager.registerRuntime(
        secondPath,
        secondRuntime,
      );
    });
    expect(secondRuntime.surface.parentElement).not.toBeNull();
    expect(secondRuntime.surface.dataset.activePaneKey).toBe("group-2:tab-2");
    expect(firstRuntime.surface.parentElement).toBe(document.body);
    expect(firstRuntime.surface.style.visibility).toBe("hidden");
    expect(richDocumentSessionManager.getActivePane(secondPath)).toBe(
      "group-2:tab-2",
    );

    act(() => unregisterSecond?.());
    unregisterFirst?.();
    view.unmount();
  });

  it("releases its identity-scoped binding and view state on close", async () => {
    richPaneViewStateRegistry.patch("group-1:tab-1", { scrollTop: 240 });
    const view = render(
      <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />,
    );

    act(() => {
      useEditorStore.getState().removeTab("group-1", "tab-1");
    });
    view.unmount();
    await act(async () => Promise.resolve());

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
    expect(richPaneViewStateRegistry.read("group-1:tab-1").scrollTop).toBe(18);
    expect(screen.getByTestId("rich-document-live-host")).toBeEmptyDOMElement();
    expect(runtime.surface.parentElement).toBe(document.body);
    expect(runtime.surface.dataset.activePaneKey).toBe("group-1:tab-next");

    act(() => unregisterRuntime?.());
  });

  it("preserves distinct same-path states across A-B-A tab switches", () => {
    const group = createGroup("group-1", "tab-a");
    group.tabs.push({ ...group.tabs[0], id: "tab-b" });
    useEditorStore.setState({ activeGroupId: "group-1", panelGroups: [group] });
    const runtime = createRuntime(path);
    runtime.readViewState.mockReturnValue({ scrollTop: 111, selection: null });
    const view = render(
      <RichDocumentPane groupId="group-1" tabId="tab-a" path={path} />,
    );
    let unregisterRuntime: (() => void) | undefined;
    act(() => {
      unregisterRuntime = richDocumentSessionManager.registerRuntime(
        path,
        runtime,
      );
    });

    act(() => {
      useEditorStore.getState().setActiveTab("group-1", "tab-b");
      view.rerender(
        <RichDocumentPane groupId="group-1" tabId="tab-b" path={path} />,
      );
    });
    expect(richPaneViewStateRegistry.read("group-1:tab-a").scrollTop).toBe(111);
    expect(runtime.restoreViewState).toHaveBeenLastCalledWith(
      expect.objectContaining({ scrollTop: 0 }),
    );

    runtime.readViewState.mockReturnValue({ scrollTop: 222, selection: null });
    act(() => {
      useEditorStore.getState().setActiveTab("group-1", "tab-a");
      view.rerender(
        <RichDocumentPane groupId="group-1" tabId="tab-a" path={path} />,
      );
    });
    expect(runtime.restoreViewState).toHaveBeenLastCalledWith(
      expect.objectContaining({ scrollTop: 111 }),
    );
    expect(richPaneViewStateRegistry.read("group-1:tab-b").scrollTop).toBe(222);
    expect(runtime.editor.replaceBlocks).not.toHaveBeenCalled();

    unregisterRuntime?.();
  });

  it("clears only an actually closed background tab state", () => {
    const group = createGroup("group-1", "tab-a");
    group.tabs.push({ ...group.tabs[0], id: "tab-b" });
    useEditorStore.setState({ activeGroupId: "group-1", panelGroups: [group] });
    const runtime = createRuntime(path);
    runtime.readViewState.mockReturnValue({ scrollTop: 120, selection: null });
    const view = render(
      <RichDocumentPane groupId="group-1" tabId="tab-a" path={path} />,
    );
    let unregisterRuntime: (() => void) | undefined;
    act(() => {
      unregisterRuntime = richDocumentSessionManager.registerRuntime(
        path,
        runtime,
      );
    });
    act(() => {
      useEditorStore.getState().setActiveTab("group-1", "tab-b");
      view.rerender(
        <RichDocumentPane groupId="group-1" tabId="tab-b" path={path} />,
      );
    });
    richPaneViewStateRegistry.patch("group-1:tab-b", { scrollTop: 220 });
    expect(richPaneViewStateRegistry.read("group-1:tab-a").scrollTop).toBe(120);

    act(() => {
      useEditorStore.getState().removeTab("group-1", "tab-a");
    });

    expect(richPaneViewStateRegistry.read("group-1:tab-a").scrollTop).toBe(0);
    expect(richPaneViewStateRegistry.read("group-1:tab-b").scrollTop).toBe(220);
    unregisterRuntime?.();
  });

  it("preserves distinct cross-path states across A-B-A tab switches", () => {
    const secondPath = "C:/notes/other.md";
    const group = createGroup("group-1", "tab-a");
    group.tabs.push({ ...group.tabs[0], id: "tab-b", filePath: secondPath });
    useEditorStore.setState({ activeGroupId: "group-1", panelGroups: [group] });
    const firstRuntime = createRuntime(path);
    const secondRuntime = createRuntime(secondPath);
    firstRuntime.readViewState.mockReturnValue({
      scrollTop: 333,
      selection: null,
    });
    secondRuntime.readViewState.mockReturnValue({
      scrollTop: 444,
      selection: null,
    });
    const view = render(
      <RichDocumentPane groupId="group-1" tabId="tab-a" path={path} />,
    );
    let unregisterFirst: (() => void) | undefined;
    let unregisterSecond: (() => void) | undefined;
    act(() => {
      unregisterFirst = richDocumentSessionManager.registerRuntime(
        path,
        firstRuntime,
      );
      unregisterSecond = richDocumentSessionManager.registerRuntime(
        secondPath,
        secondRuntime,
      );
    });

    act(() => {
      useEditorStore.getState().setActiveTab("group-1", "tab-b");
      view.rerender(
        <RichDocumentPane groupId="group-1" tabId="tab-b" path={secondPath} />,
      );
    });
    expect(richPaneViewStateRegistry.read("group-1:tab-a").scrollTop).toBe(333);
    expect(secondRuntime.restoreViewState).toHaveBeenLastCalledWith(
      expect.objectContaining({ scrollTop: 0 }),
    );

    act(() => {
      useEditorStore.getState().setActiveTab("group-1", "tab-a");
      view.rerender(
        <RichDocumentPane groupId="group-1" tabId="tab-a" path={path} />,
      );
    });
    expect(firstRuntime.restoreViewState).toHaveBeenLastCalledWith(
      expect.objectContaining({ scrollTop: 333 }),
    );
    expect(richPaneViewStateRegistry.read("group-1:tab-b").scrollTop).toBe(444);

    unregisterFirst?.();
    unregisterSecond?.();
  });

  it("preserves pane state during StrictMode effect replay", async () => {
    richPaneViewStateRegistry.patch("group-1:tab-1", { scrollTop: 512 });
    const runtime = createRuntime(path);
    runtime.readViewState.mockReturnValue({ scrollTop: 512, selection: null });
    const unregisterRuntime = richDocumentSessionManager.registerRuntime(
      path,
      runtime,
    );

    render(
      <StrictMode>
        <RichDocumentPane groupId="group-1" tabId="tab-1" path={path} />
      </StrictMode>,
    );
    await act(async () => Promise.resolve());

    expect(richPaneViewStateRegistry.read("group-1:tab-1").scrollTop).toBe(512);
    expect(runtime.restoreViewState).toHaveBeenLastCalledWith(
      expect.objectContaining({ scrollTop: 512 }),
    );
    unregisterRuntime();
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
    editor: { replaceBlocks: vi.fn() },
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
