import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {},
  shell: { showItemInFolder: vi.fn() },
}));

import { readDirectory } from "./file";
import { shouldIgnoreFsWatchPath, WorkspaceWatchRegistry } from "./file-watch";

describe("shouldIgnoreFsWatchPath", () => {
  it("ignores dependency and git internals in any path segment", () => {
    expect(shouldIgnoreFsWatchPath("notes/.git/index")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/node_modules/pkg/index.js")).toBe(
      true,
    );
  });

  it("ignores temporary, swap, backup, and cloud placeholder files", () => {
    expect(shouldIgnoreFsWatchPath("notes/.DS_Store")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/.tolaria-rename-txn")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/.#draft.md")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.md~")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.tmp")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.swp")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.swx")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.md.icloud")).toBe(true);
  });

  it("does not ignore regular markdown files", () => {
    expect(shouldIgnoreFsWatchPath("notes/daily.md")).toBe(false);
    expect(shouldIgnoreFsWatchPath("notes/folder/daily.md")).toBe(false);
  });
});

describe("readDirectory ignore integration", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips ignored folders and files while keeping markdown notes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keep-notes-watch-"));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(
      path.join(root, "node_modules", "ignored.md"),
      "# ignored",
    );
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, ".git", "ignored.md"), "# ignored");
    fs.writeFileSync(path.join(root, ".DS_Store"), "");
    fs.writeFileSync(path.join(root, "daily.md"), "# daily");

    const tree = await readDirectory(root);

    expect(tree).toEqual([
      { title: "daily.md", key: path.join(root, "daily.md") },
    ]);
  });
});

describe("WorkspaceWatchRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces multiple relevant events into one workspace notification", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    let listener:
      | ((eventType: string, fileName: string | Buffer | null) => void)
      | undefined;
    const onChange = vi.fn();
    const registry = new WorkspaceWatchRegistry({
      watch: (_path, _options, callback) => {
        listener = callback;
        return { close };
      },
      debounceMs: 80,
    });

    registry.watchWorkspace("notes", onChange);
    listener?.("rename", "a.md");
    listener?.("change", "b.md");
    vi.advanceTimersByTime(79);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("notes");

    registry.unwatchWorkspace("notes");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignores filtered workspace events", () => {
    vi.useFakeTimers();
    let listener:
      | ((eventType: string, fileName: string | Buffer | null) => void)
      | undefined;
    const onChange = vi.fn();
    const registry = new WorkspaceWatchRegistry({
      watch: (_path, _options, callback) => {
        listener = callback;
        return { close: vi.fn() };
      },
      debounceMs: 80,
    });

    registry.watchWorkspace("notes", onChange);
    listener?.("change", "node_modules/pkg/index.js");
    listener?.("change", ".DS_Store");
    vi.advanceTimersByTime(80);
    expect(onChange).not.toHaveBeenCalled();

    registry.unwatchWorkspace("notes");
  });
});
