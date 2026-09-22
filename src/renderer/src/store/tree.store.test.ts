import { beforeEach, describe, expect, it } from "vitest";
import { useTreeStore } from "./tree.store";

describe("tree store lazy directory state", () => {
  beforeEach(() => {
    useTreeStore.getState().resetTree();
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
  });

  it("replaces one directory children and marks it loaded", () => {
    useTreeStore
      .getState()
      .replaceDirectoryChildren("/notes/docs", [
        { title: "daily.md", key: "/notes/docs/daily.md" },
      ]);

    expect(useTreeStore.getState().treeData[0]).toMatchObject({
      key: "/notes/docs",
      isLoaded: true,
      children: [{ key: "/notes/docs/daily.md" }],
    });
  });

  it("tracks a delayed directory loading indicator independently", () => {
    useTreeStore.getState().setDirectoryLoading("/notes/docs", true);
    expect(
      useTreeStore.getState().loadingDirectoryKeys.has("/notes/docs"),
    ).toBe(true);

    useTreeStore.getState().setDirectoryLoading("/notes/docs", false);
    expect(
      useTreeStore.getState().loadingDirectoryKeys.has("/notes/docs"),
    ).toBe(false);
  });

  it("resets full-tree search readiness when switching workspaces", () => {
    useTreeStore.getState().setTreeFullyLoaded(true);
    useTreeStore.getState().setTreeRoot({ title: "other", key: "/other" });

    expect(useTreeStore.getState().isTreeFullyLoaded).toBe(false);
  });

  it("replaces workspace tree state atomically and clears stale navigation", () => {
    useTreeStore.setState({
      fullTreeData: [{ title: "old.md", key: "/notes/old.md" }],
      selectedKey: "/notes/old.md",
      expandedKeys: new Set(["/notes", "/notes/docs"]),
      loadingDirectoryKeys: new Set(["/notes/docs"]),
      isTreeFullyLoaded: true,
    });
    const snapshots: Array<{
      root: string | undefined;
      firstNode: string | undefined;
    }> = [];
    const unsubscribe = useTreeStore.subscribe((state) => {
      snapshots.push({
        root: state.treeRoot?.key,
        firstNode: state.treeData[0]?.key,
      });
    });

    useTreeStore
      .getState()
      .setWorkspaceTree([{ title: "new.md", key: "/other/new.md" }], {
        title: "other",
        key: "/other",
      });
    unsubscribe();

    const state = useTreeStore.getState();
    expect(snapshots).toEqual([{ root: "/other", firstNode: "/other/new.md" }]);
    expect(state.selectedKey).toBeNull();
    expect(state.expandedKeys).toEqual(new Set(["/other"]));
    expect(state.loadingDirectoryKeys).toEqual(new Set());
    expect(state.fullTreeData).toBeNull();
    expect(state.isTreeFullyLoaded).toBe(false);
  });

  it("preserves navigation when refreshing the current workspace", () => {
    useTreeStore.setState({
      selectedKey: "/notes/docs/daily.md",
      expandedKeys: new Set(["/notes", "/notes/docs"]),
    });

    useTreeStore
      .getState()
      .setWorkspaceTree([{ title: "docs", key: "/notes/docs", children: [] }], {
        title: "notes",
        key: "/notes",
      });

    const state = useTreeStore.getState();
    expect(state.selectedKey).toBe("/notes/docs/daily.md");
    expect(state.expandedKeys).toEqual(new Set(["/notes", "/notes/docs"]));
  });
});
