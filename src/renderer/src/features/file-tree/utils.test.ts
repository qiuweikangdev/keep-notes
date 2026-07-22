import { describe, expect, it } from "vitest";
import {
  buildCreatedNodeKey,
  buildRenamedFileKey,
  buildFileTreeRows,
  canMoveNodeToFolder,
  findAncestorKeys,
  flattenTree,
  getRevealInFileManagerLabel,
  shouldRevealFileTreeOnViewChange,
  shouldSyncSelectionToActiveFile,
} from "./utils";

describe("buildCreatedNodeKey", () => {
  it("adds the markdown extension for a created file", () => {
    expect(buildCreatedNodeKey("D:\\notes\\work", "todo", "file")).toBe(
      "D:\\notes\\work\\todo.md",
    );
  });

  it("keeps folder names without a file extension", () => {
    expect(buildCreatedNodeKey("/notes/work", "archive", "folder")).toBe(
      "/notes/work/archive",
    );
  });
});

describe("buildRenamedFileKey", () => {
  it("preserves the parent path and Markdown extension", () => {
    expect(buildRenamedFileKey("D:\\notes\\draft.md", "meeting")).toBe(
      "D:\\notes\\meeting.md",
    );
  });
});

describe("getRevealInFileManagerLabel", () => {
  it("returns Finder copy on macOS", () => {
    expect(getRevealInFileManagerLabel("darwin")).toBe("在 Finder 中显示");
  });

  it("returns Explorer copy on Windows", () => {
    expect(getRevealInFileManagerLabel("win32")).toBe("在资源管理器中显示");
  });

  it("falls back to Explorer copy on other platforms", () => {
    expect(getRevealInFileManagerLabel("linux")).toBe("在资源管理器中显示");
  });
});

describe("canMoveNodeToFolder", () => {
  it("allows moving a file into another folder", () => {
    expect(canMoveNodeToFolder("D:/notes/a.md", "D:/notes/archive")).toBe(true);
  });

  it("prevents moving a node into itself", () => {
    expect(canMoveNodeToFolder("D:/notes/a", "D:/notes/a")).toBe(false);
  });

  it("prevents moving a folder into its own descendant", () => {
    expect(canMoveNodeToFolder("D:/notes/a", "D:/notes/a/child")).toBe(false);
  });
});

describe("flattenTree", () => {
  it("keeps parent folder path on child file rows", () => {
    const flatNodes = flattenTree(
      [
        {
          key: "D:/notes/B",
          title: "B",
          children: [
            {
              key: "D:/notes/B/a.md",
              title: "a.md",
            },
          ],
        },
      ],
      new Set(["D:/notes/B"]),
      1,
      "D:/notes",
    );

    expect(flatNodes).toEqual([
      expect.objectContaining({
        key: "D:/notes/B",
        parentKey: "D:/notes",
      }),
      expect.objectContaining({
        key: "D:/notes/B/a.md",
        parentKey: "D:/notes/B",
      }),
    ]);
  });

  it("keeps an unloaded folder expandable before its children are known", () => {
    const [folder] = flattenTree(
      [
        {
          key: "/notes/docs",
          title: "docs",
          children: [],
          isLoaded: false,
        },
      ],
      new Set(),
    );

    expect(folder).toMatchObject({
      isFolder: true,
      hasChildren: true,
      isLoaded: false,
    });
  });
});

describe("buildFileTreeRows", () => {
  const flatNodes = [
    {
      key: "D:/notes/work",
      title: "work",
      level: 1,
      isFolder: true,
      hasChildren: false,
      parentKey: "D:/notes",
    },
    {
      key: "D:/notes/work/daily.md",
      title: "daily.md",
      level: 2,
      isFolder: false,
      hasChildren: false,
      parentKey: "D:/notes/work",
    },
  ];

  it("inserts the create row directly after its parent folder", () => {
    expect(buildFileTreeRows(flatNodes, "D:/notes/work")).toEqual([
      { type: "node", key: "D:/notes/work", node: flatNodes[0] },
      {
        type: "create",
        key: "create:D:/notes/work",
        parentKey: "D:/notes/work",
      },
      { type: "node", key: "D:/notes/work/daily.md", node: flatNodes[1] },
    ]);
  });

  it("keeps only real nodes when there is no visible parent for the create row", () => {
    expect(buildFileTreeRows(flatNodes, "D:/notes/missing")).toEqual([
      { type: "node", key: "D:/notes/work", node: flatNodes[0] },
      { type: "node", key: "D:/notes/work/daily.md", node: flatNodes[1] },
    ]);
  });
});

describe("findAncestorKeys", () => {
  it("returns folder ancestors for a nested file", () => {
    const ancestors = findAncestorKeys(
      [
        {
          key: "D:/notes/projects",
          title: "projects",
          children: [
            {
              key: "D:/notes/projects/app",
              title: "app",
              children: [
                {
                  key: "D:/notes/projects/app/readme.md",
                  title: "readme.md",
                },
              ],
            },
          ],
        },
      ],
      "D:/notes/projects/app/readme.md",
    );

    expect(ancestors).toEqual(["D:/notes/projects", "D:/notes/projects/app"]);
  });

  it("returns an empty list when the file is not in the tree", () => {
    expect(findAncestorKeys([], "D:/notes/missing.md")).toEqual([]);
  });
});

describe("shouldRevealFileTreeOnViewChange", () => {
  it("reveals the current file when switching from outline to file tree", () => {
    expect(shouldRevealFileTreeOnViewChange("outline", "file")).toBe(true);
  });

  it("keeps the current scroll position when staying in the file tree", () => {
    expect(shouldRevealFileTreeOnViewChange("file", "file")).toBe(false);
  });
});

describe("shouldSyncSelectionToActiveFile", () => {
  it("syncs the active file when switching back to the file tree", () => {
    expect(shouldSyncSelectionToActiveFile("outline", "file")).toBe(true);
  });

  it("keeps manually selected or newly created nodes while staying in the file tree", () => {
    expect(shouldSyncSelectionToActiveFile("file", "file")).toBe(false);
  });
});
