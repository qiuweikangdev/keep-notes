import { describe, expect, it } from "vitest";
import { canMoveNodeToFolder, getRevealInFileManagerLabel } from "./utils";

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
