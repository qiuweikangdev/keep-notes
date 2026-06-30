import { describe, expect, it } from "vitest";
import type { GitStatus } from "@/types";
import {
  buildGitFileTree,
  getGitStatusBadge,
  getVisibleGitFilePaths,
} from "./git-status-view";

const baseStatus: GitStatus = {
  current: "main",
  tracking: "origin/main",
  files: [],
  ahead: 0,
  behind: 0,
  created: [],
  not_added: [],
  modified: [],
  deleted: [],
  renamed: [],
  staged: [],
  conflicted: [],
};

describe("git-status-view", () => {
  it("deduplicates visible files and keeps folders before files", () => {
    const paths = getVisibleGitFilePaths({
      ...baseStatus,
      staged: ["docs/readme.md", "docs/guide/install.md"],
      modified: ["docs/readme.md"],
      deleted: ["app.ts"],
      not_added: ["docs/guide/intro.md"],
    });

    expect(paths).toEqual([
      "docs/readme.md",
      "docs/guide/install.md",
      "docs/guide/intro.md",
      "app.ts",
    ]);

    expect(buildGitFileTree(paths)).toEqual([
      {
        name: "docs",
        path: "docs",
        isFile: false,
        children: [
          {
            name: "guide",
            path: "docs/guide",
            isFile: false,
            children: [
              {
                name: "install.md",
                path: "docs/guide/install.md",
                isFile: true,
                children: [],
              },
              {
                name: "intro.md",
                path: "docs/guide/intro.md",
                isFile: true,
                children: [],
              },
            ],
          },
          {
            name: "readme.md",
            path: "docs/readme.md",
            isFile: true,
            children: [],
          },
        ],
      },
      {
        name: "app.ts",
        path: "app.ts",
        isFile: true,
        children: [],
      },
    ]);
  });

  it("maps git status arrays to compact badges", () => {
    const status: GitStatus = {
      ...baseStatus,
      modified: ["changed.md"],
      created: ["created.md"],
      not_added: ["new.md"],
      deleted: ["removed.md"],
      renamed: [{ from: "old.md", to: "renamed.md" }],
      conflicted: ["conflict.md"],
    };

    expect(getGitStatusBadge(status, "changed.md")?.label).toBe("M");
    expect(getGitStatusBadge(status, "created.md")?.label).toBe("A");
    expect(getGitStatusBadge(status, "new.md")?.label).toBe("A");
    expect(getGitStatusBadge(status, "removed.md")?.label).toBe("D");
    expect(getGitStatusBadge(status, "renamed.md")?.label).toBe("R");
    expect(getGitStatusBadge(status, "conflict.md")?.label).toBe("U");
  });
});
