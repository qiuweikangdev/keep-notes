import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMarkdownFilePathsFromCommandLine,
  normalizeMarkdownFilePath,
} from "./markdown-open";

describe("Markdown system open requests", () => {
  it("normalizes a Markdown path and accepts uppercase extensions", () => {
    expect(normalizeMarkdownFilePath("notes/Daily.MD", "/workspace")).toBe(
      path.resolve("/workspace", "notes/Daily.MD"),
    );
  });

  it("ignores flags and unsupported files from the command line", () => {
    expect(
      getMarkdownFilePathsFromCommandLine(
        ["keep-notes", "--new-window", "notes/a.md", "notes/image.png"],
        "/workspace",
      ),
    ).toEqual([path.resolve("/workspace", "notes/a.md")]);
  });

  it("deduplicates repeated Markdown paths", () => {
    expect(
      getMarkdownFilePathsFromCommandLine(
        ["/workspace/notes/a.md", "/workspace/notes/a.md"],
        "/workspace",
      ),
    ).toEqual([path.resolve("/workspace/notes/a.md")]);
  });
});
