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
});
