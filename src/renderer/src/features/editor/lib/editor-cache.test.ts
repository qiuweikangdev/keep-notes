import { describe, expect, it } from "vitest";

import { EditorCache } from "./editor-cache";

describe("EditorCache", () => {
  it("returns content only when the stored source matches", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setContent("a.md", "alpha");
    cache.setBlocks("a.md", "alpha", "parsed-alpha");

    expect(cache.getContent("a.md")).toBe("alpha");
    expect(cache.getBlocks("a.md", "alpha")).toEqual({
      blocks: "parsed-alpha",
    });
    expect(cache.getBlocks("a.md", "changed")).toBeNull();
  });

  it("evicts the least recently used path", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setContent("a.md", "a");
    cache.setContent("b.md", "b");
    cache.getContent("a.md");
    cache.setContent("c.md", "c");

    expect(cache.getContent("a.md")).toBe("a");
    expect(cache.getContent("b.md")).toBeNull();
    expect(cache.getContent("c.md")).toBe("c");
  });

  it("does not restore scroll position from parsed block cache", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setBlocks("a.md", "a", "blocks-a");
    cache.setBlocks("b.md", "b", "blocks-b");

    cache.setScrollTop("a.md", 96);

    expect(cache.getBlocks("a.md", "a")).toEqual({ blocks: "blocks-a" });
    expect(cache.getBlocks("b.md", "b")).toEqual({ blocks: "blocks-b" });
  });

  it("stores serialized baseline with parsed blocks", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });

    cache.setBlocks("a.md", "a", "blocks-a", "parser-v1", "baseline-a");

    expect(cache.getBlocks("a.md", "a", "parser-v1")).toEqual({
      blocks: "blocks-a",
      serializedBaseline: "baseline-a",
    });
    expect(cache.getBlocks("a.md", "a", "parser-v2")).toBeNull();
  });

  it("reports whether parsed blocks still match the current source", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setBlocks("a.md", "alpha", "parsed-alpha", "parser-v1");

    expect(cache.hasParsedSource("a.md", "alpha")).toBe(true);
    expect(cache.hasParsedSource("a.md", "changed")).toBe(false);

    cache.setContent("a.md", "changed");
    expect(cache.hasParsedSource("a.md", "changed")).toBe(false);
  });
});

it("keeps an explicit reparse pending when an old runtime writes its cached snapshot", () => {
  const cache = new EditorCache<string>({ maxEntries: 2 });
  cache.setBlocks("a.md", "source", "old", "v1");
  cache.invalidateBlocks("a.md");
  cache.setBlocks("a.md", "source", "old cleanup", "v1");
  expect(cache.hasParsedSource("a.md", "source")).toBe(false);
  expect(cache.getBlocks("a.md", "source", "v1")).toBeNull();
  cache.finishReparse("a.md");
  cache.setBlocks("a.md", "source", "reparsed", "v1");
  expect(cache.getBlocks("a.md", "source", "v1")?.blocks).toBe("reparsed");
});

it("shares cached blocks and explicit invalidation across Windows path separators", () => {
  const cache = new EditorCache<string>({ maxEntries: 2 });
  const windowsPath = String.raw`C:\notes\a.md`;
  const runtimePath = "C:/notes/a.md";
  cache.setContent(windowsPath, "source");
  cache.setBlocks(runtimePath, "source", "blocks", "v1");
  expect(cache.getContent(runtimePath)).toBe("source");
  expect(cache.getBlocks(windowsPath, "source", "v1")?.blocks).toBe("blocks");
  expect(cache.getDiagnostics().entries).toBe(1);
  cache.invalidateBlocks(windowsPath);
  expect(cache.hasParsedSource(runtimePath, "source")).toBe(false);
  cache.finishReparse(runtimePath);
  cache.setBlocks(windowsPath, "source", "reparsed", "v1");
  expect(cache.getBlocks(runtimePath, "source", "v1")?.blocks).toBe("reparsed");
  cache.delete(windowsPath);
  expect(cache.getContent(runtimePath)).toBeNull();
});
