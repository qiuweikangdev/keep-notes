import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backgroundEditorSaveCoordinator,
  editorSaveCoordinator,
  richDocumentSessionManager,
} from "@/features/editor/lib/editor-runtime";
import { BACKGROUND_EDITOR_SAVE_GROUP_ID } from "@/features/editor/lib/editor-background-save-coordinator";
import { useEditorStore } from "@/store/editor.store";
import { EditorBridge } from "./editor-bridge";

const updateDirtyState = vi.fn();

function seedBackgroundDraft(): void {
  const baseGroup = useEditorStore.getState().panelGroups[0];
  const cleanTab = {
    ...baseGroup.tabs[0],
    id: "tab-clean",
    filePath: "/notes/clean.md",
    content: "clean",
  };
  const draftTab = {
    ...baseGroup.tabs[0],
    id: "tab-draft",
    filePath: null,
    content: "draft",
    isDirty: true,
    saveStatus: "dirty" as const,
  };

  useEditorStore.setState({
    activeGroupId: "group-1",
    panelGroups: [
      {
        ...baseGroup,
        id: "group-1",
        activeTabId: cleanTab.id,
        tabs: [cleanTab, draftTab],
      },
    ],
  });
}

describe("EditorBridge close protection", () => {
  beforeEach(() => {
    updateDirtyState.mockReset();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { updateDirtyState },
    });
    seedBackgroundDraft();
  });

  afterEach(() => {
    cleanup();
    backgroundEditorSaveCoordinator.cancelAll();
  });

  it("reports a background draft and selects it for close saving", async () => {
    render(<EditorBridge />);

    expect(updateDirtyState).toHaveBeenLastCalledWith(true);
    await expect((window as any).__getNextDirtyEditor()).resolves.toEqual({
      groupId: "group-1",
      tabId: "tab-draft",
      content: "draft",
      filePath: null,
    });
    expect(useEditorStore.getState().panelGroups[0].activeTabId).toBe(
      "tab-draft",
    );
  });

  it("marks the exact saved draft clean and assigns its Save As path", () => {
    render(<EditorBridge />);

    act(() => {
      (window as any).__onCloseSaveSuccess(
        "group-1",
        "tab-draft",
        "/notes/draft.md",
        "draft",
      );
    });

    const draft = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((tab) => tab.id === "tab-draft");
    expect(draft).toMatchObject({
      filePath: "/notes/draft.md",
      isDirty: false,
    });
    expect(updateDirtyState).toHaveBeenLastCalledWith(false);
  });

  it("keeps a draft dirty when its content changes while the snapshot is saving", async () => {
    render(<EditorBridge />);

    await expect((window as any).__getNextDirtyEditor()).resolves.toMatchObject(
      {
        content: "draft",
        filePath: null,
      },
    );

    act(() => {
      useEditorStore
        .getState()
        .setTabContent("group-1", "tab-draft", 'new "draft"\nline');
      (window as any).__onCloseSaveSuccess(
        "group-1",
        "tab-draft",
        "/notes/draft.md",
        "draft",
      );
    });

    const draft = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((tab) => tab.id === "tab-draft");
    expect(draft).toMatchObject({
      filePath: "/notes/draft.md",
      content: 'new "draft"\nline',
      isDirty: true,
    });
    await expect((window as any).__getNextDirtyEditor()).resolves.toEqual({
      groupId: "group-1",
      tabId: "tab-draft",
      content: 'new "draft"\nline',
      filePath: "/notes/draft.md",
    });
    expect(updateDirtyState).toHaveBeenLastCalledWith(true);
  });

  it("serializes a live rich revision before returning its close snapshot", async () => {
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) => ({
        ...group,
        activeTabId: "tab-clean",
        tabs: group.tabs.map((tab) =>
          tab.id === "tab-clean"
            ? { ...tab, isDirty: true, saveStatus: "dirty" as const }
            : { ...tab, isDirty: false, saveStatus: "clean" as const },
        ),
      })),
    }));
    const releaseRuntime = richDocumentSessionManager.registerRuntime(
      "/notes/clean.md",
      {
        path: "/notes/clean.md",
        surface: document.createElement("div"),
        serializePendingChange: vi.fn(async () => {
          useEditorStore
            .getState()
            .setTabContent("group-1", "tab-clean", "latest live content");
        }),
        cancelPendingWork: vi.fn(),
        destroy: vi.fn(),
        isDirty: () => true,
        isSaving: () => false,
        isReloading: () => false,
      },
    );
    render(<EditorBridge />);

    await expect((window as any).__getNextDirtyEditor()).resolves.toMatchObject(
      {
        groupId: "group-1",
        tabId: "tab-clean",
        content: "latest live content",
      },
    );
    releaseRuntime();
  });

  it("keeps close protection active while a reused large document saves in background", async () => {
    const release = vi.fn();
    backgroundEditorSaveCoordinator.track({
      path: "/notes/large.md",
      flush: vi.fn().mockResolvedValue(false),
      getContent: () => "# Latest serialized content",
      release,
    });
    editorSaveCoordinator.schedule(
      "/notes/large.md",
      "# Latest serialized content",
    );
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => ({
          ...tab,
          isDirty: false,
          saveStatus: "clean" as const,
        })),
      })),
    }));

    render(<EditorBridge />);

    expect(updateDirtyState).toHaveBeenLastCalledWith(true);
    await expect((window as any).__getNextDirtyEditor()).resolves.toEqual({
      groupId: BACKGROUND_EDITOR_SAVE_GROUP_ID,
      tabId: "/notes/large.md",
      filePath: "/notes/large.md",
      content: "# Latest serialized content",
    });

    act(() => {
      (window as any).__onCloseSaveSuccess(
        BACKGROUND_EDITOR_SAVE_GROUP_ID,
        "/notes/large.md",
        "/notes/large.md",
        "# Latest serialized content",
      );
    });
    expect(release).toHaveBeenCalledOnce();
    expect(editorSaveCoordinator.hasPending("/notes/large.md")).toBe(false);
    expect(updateDirtyState).toHaveBeenLastCalledWith(false);
  });

  it("keeps a newer background revision pending when an older close snapshot finishes", async () => {
    const path = "/notes/shared-large.md";
    const release = vi.fn();
    backgroundEditorSaveCoordinator.track({
      path,
      flush: vi.fn().mockResolvedValue(false),
      getContent: () => editorSaveCoordinator.getPendingContent(path),
      release,
    });
    editorSaveCoordinator.schedule(path, "# First snapshot");
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) => ({
        ...group,
        tabs: group.tabs.map((tab) => ({
          ...tab,
          isDirty: false,
          saveStatus: "clean" as const,
        })),
      })),
    }));
    render(<EditorBridge />);

    await expect((window as any).__getNextDirtyEditor()).resolves.toMatchObject(
      {
        content: "# First snapshot",
      },
    );
    editorSaveCoordinator.schedule(path, "# Newer snapshot");

    act(() => {
      (window as any).__onCloseSaveSuccess(
        BACKGROUND_EDITOR_SAVE_GROUP_ID,
        path,
        path,
        "# First snapshot",
      );
    });

    expect(backgroundEditorSaveCoordinator.hasPending(path)).toBe(true);
    expect(editorSaveCoordinator.getPendingContent(path)).toBe(
      "# Newer snapshot",
    );
    expect(release).not.toHaveBeenCalled();
    await expect((window as any).__getNextDirtyEditor()).resolves.toMatchObject(
      {
        content: "# Newer snapshot",
      },
    );
    act(() => {
      (window as any).__onCloseSaveSuccess(
        BACKGROUND_EDITOR_SAVE_GROUP_ID,
        path,
        path,
        "# Newer snapshot",
      );
    });
    expect(backgroundEditorSaveCoordinator.hasPending(path)).toBe(false);
    expect(editorSaveCoordinator.hasPending(path)).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });
});
