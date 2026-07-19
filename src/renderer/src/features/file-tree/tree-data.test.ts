import { describe, expect, it } from "vitest";
import type { TreeNode } from "@/types";
import {
  getDirectoriesToRefresh,
  getLoadedDirectoryKeys,
  getTreePathDirectories,
  replaceDirectoryChildren,
} from "./tree-data";

describe("replaceDirectoryChildren", () => {
  it("refreshes one directory while preserving loaded descendant caches", () => {
    const treeData: TreeNode[] = [
      {
        title: "docs",
        key: "/notes/docs",
        children: [
          {
            title: "guides",
            key: "/notes/docs/guides",
            children: [
              {
                title: "start.md",
                key: "/notes/docs/guides/start.md",
              },
            ],
            isLoaded: true,
          },
        ],
        isLoaded: true,
      },
      { title: "root.md", key: "/notes/root.md" },
    ];

    const nextTree = replaceDirectoryChildren(
      treeData,
      "/notes",
      "/notes/docs",
      [
        {
          title: "guides",
          key: "/notes/docs/guides",
          children: [],
          isLoaded: false,
        },
        { title: "new.md", key: "/notes/docs/new.md" },
      ],
    );

    expect(nextTree[0]).toMatchObject({
      key: "/notes/docs",
      isLoaded: true,
      children: [
        {
          key: "/notes/docs/guides",
          isLoaded: true,
          children: [{ key: "/notes/docs/guides/start.md" }],
        },
        { key: "/notes/docs/new.md" },
      ],
    });
    expect(nextTree[1]).toBe(treeData[1]);
  });

  it("refreshes the root without discarding loaded branches", () => {
    const treeData: TreeNode[] = [
      {
        title: "docs",
        key: "C:\\notes\\docs",
        children: [{ title: "daily.md", key: "C:\\notes\\docs\\daily.md" }],
        isLoaded: true,
      },
    ];

    const nextTree = replaceDirectoryChildren(
      treeData,
      "C:\\notes",
      "C:\\notes",
      [
        {
          title: "docs",
          key: "C:\\notes\\docs",
          children: [],
          isLoaded: false,
        },
        { title: "root.md", key: "C:\\notes\\root.md" },
      ],
    );

    expect(nextTree[0]).toMatchObject({
      isLoaded: true,
      children: [{ key: "C:\\notes\\docs\\daily.md" }],
    });
    expect(nextTree[1]).toMatchObject({ key: "C:\\notes\\root.md" });
  });
});

describe("tree directory metadata", () => {
  it("lists only directories whose children have already been loaded", () => {
    const treeData: TreeNode[] = [
      {
        title: "docs",
        key: "/notes/docs",
        children: [
          {
            title: "guides",
            key: "/notes/docs/guides",
            children: [],
            isLoaded: false,
          },
        ],
        isLoaded: true,
      },
    ];

    expect(getLoadedDirectoryKeys(treeData, "/notes")).toEqual([
      "/notes",
      "/notes/docs",
    ]);
  });

  it("refreshes only loaded parents affected by structural events", () => {
    const treeData: TreeNode[] = [
      {
        title: "docs",
        key: "/notes/docs",
        children: [],
        isLoaded: true,
      },
      {
        title: "archive",
        key: "/notes/archive",
        children: [],
        isLoaded: false,
      },
    ];

    expect(
      getDirectoriesToRefresh(
        {
          rootPath: "/notes",
          events: [
            { eventType: "change", path: "/notes/docs/saved.md" },
            { eventType: "rename", path: "/notes/docs/new.md" },
            { eventType: "rename", path: "/notes/archive/new.md" },
          ],
          hasUnknownPath: false,
        },
        treeData,
      ),
    ).toEqual(["/notes/docs"]);
  });

  it("falls back to every loaded directory for unknown watcher paths", () => {
    const treeData: TreeNode[] = [
      {
        title: "docs",
        key: "C:\\notes\\docs",
        children: [],
        isLoaded: true,
      },
    ];

    expect(
      getDirectoriesToRefresh(
        {
          rootPath: "C:\\notes",
          events: [],
          hasUnknownPath: true,
        },
        treeData,
      ),
    ).toEqual(["C:\\notes", "C:\\notes\\docs"]);
  });

  it("derives ancestor directories without requiring the target in the tree", () => {
    expect(
      getTreePathDirectories("C:\\notes", "C:\\notes\\docs\\guides\\start.md"),
    ).toEqual(["C:\\notes\\docs", "C:\\notes\\docs\\guides"]);
    expect(getTreePathDirectories("/notes", "/other/start.md")).toEqual([]);
  });
});
