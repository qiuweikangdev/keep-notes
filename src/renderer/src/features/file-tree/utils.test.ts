import { describe, expect, it } from "vitest";
import { getRevealInFileManagerLabel } from "./utils";

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
