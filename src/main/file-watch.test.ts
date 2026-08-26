import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  dialog: {},
  shell: { showItemInFolder: vi.fn() },
}));

import { readDirectory } from "./file";
import {
  FileContentWatchRegistry,
  shouldIgnoreFsWatchPath,
  WorkspaceWatchRegistry,
} from "./file-watch";

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
    expect(
      shouldIgnoreFsWatchPath("notes/.tolaria-rename-txn-operation-id"),
    ).toBe(true);
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

    registry.watchWorkspace(1, "notes", onChange);
    listener?.("rename", "a.md");
    listener?.("change", "b.md");
    vi.advanceTimersByTime(79);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      rootPath: "notes",
      events: [
        { eventType: "rename", path: path.join("notes", "a.md") },
        { eventType: "change", path: path.join("notes", "b.md") },
      ],
      hasUnknownPath: false,
    });

    registry.unwatchWorkspace(1, "notes");
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

    registry.watchWorkspace(1, "notes", onChange);
    listener?.("change", "node_modules/pkg/index.js");
    listener?.("change", ".DS_Store");
    vi.advanceTimersByTime(80);
    expect(onChange).not.toHaveBeenCalled();

    registry.unwatchWorkspace(1, "notes");
  });

  it("reports an unknown-path fallback when fs.watch omits the file name", () => {
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

    registry.watchWorkspace(1, "notes", onChange);
    listener?.("rename", null);
    vi.advanceTimersByTime(80);

    expect(onChange).toHaveBeenCalledWith({
      rootPath: "notes",
      events: [],
      hasUnknownPath: true,
    });
  });

  it("shares one watcher across windows and closes it after the last release", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const watchListeners: Array<
      (eventType: string, fileName: string | Buffer | null) => void
    > = [];
    const firstWindowListener = vi.fn();
    const secondWindowListener = vi.fn();
    const registry = new WorkspaceWatchRegistry({
      watch: (_path, _options, callback) => {
        watchListeners.push(callback);
        return { close };
      },
      debounceMs: 80,
    });

    registry.watchWorkspace(1, "notes", firstWindowListener);
    registry.watchWorkspace(2, "notes", secondWindowListener);
    registry.watchWorkspace(1, "notes", firstWindowListener);

    expect(watchListeners).toHaveLength(1);
    watchListeners[0]("change", "daily.md");
    vi.advanceTimersByTime(80);

    expect(firstWindowListener).toHaveBeenCalledTimes(1);
    expect(secondWindowListener).toHaveBeenCalledTimes(1);

    registry.unwatchWorkspace(1, "notes");
    expect(close).not.toHaveBeenCalled();
    registry.unwatchWorkspace(2, "notes");
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("FileContentWatchRegistry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("watches the parent directory and reads content after rename events", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    let watchedPath = "";
    let listener:
      | ((eventType: string, fileName: string | Buffer | null) => void)
      | undefined;
    const onChange = vi.fn();
    const registry = new FileContentWatchRegistry({
      watch: (targetPath, _options, callback) => {
        watchedPath = targetPath;
        listener = callback;
        return { close };
      },
      readFile: vi.fn().mockResolvedValue("updated"),
      debounceMs: 80,
    });

    registry.watchFile(1, "notes/daily.md", onChange);
    listener?.("rename", "daily.md");

    expect(watchedPath).toBe("notes");
    vi.advanceTimersByTime(80);
    await vi.runAllTimersAsync();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("notes/daily.md", "updated");

    registry.unwatchFile(1, "notes/daily.md");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated directory events while keeping the watcher alive", () => {
    vi.useFakeTimers();
    let listener:
      | ((eventType: string, fileName: string | Buffer | null) => void)
      | undefined;
    const onChange = vi.fn();
    const readFile = vi.fn().mockResolvedValue("updated");
    const registry = new FileContentWatchRegistry({
      watch: (_targetPath, _options, callback) => {
        listener = callback;
        return { close: vi.fn() };
      },
      readFile,
      debounceMs: 80,
    });

    registry.watchFile(1, "notes/daily.md", onChange);
    listener?.("change", "other.md");
    listener?.("rename", ".DS_Store");
    vi.advanceTimersByTime(80);

    expect(readFile).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    registry.unwatchFile(1, "notes/daily.md");
  });

  it("coalesces repeated file events into one content update", async () => {
    vi.useFakeTimers();
    let listener:
      | ((eventType: string, fileName: string | Buffer | null) => void)
      | undefined;
    const onChange = vi.fn();
    const readFile = vi.fn().mockResolvedValue("updated");
    const registry = new FileContentWatchRegistry({
      watch: (_targetPath, _options, callback) => {
        listener = callback;
        return { close: vi.fn() };
      },
      readFile,
      debounceMs: 80,
    });

    registry.watchFile(1, "notes/daily.md", onChange);
    listener?.("rename", "daily.md");
    vi.advanceTimersByTime(40);
    listener?.("change", "daily.md");
    vi.advanceTimersByTime(80);
    await vi.runAllTimersAsync();

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    registry.unwatchFile(1, "notes/daily.md");
  });

  it("shares one watcher across windows and broadcasts the file once", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const watchListeners: Array<
      (eventType: string, fileName: string | Buffer | null) => void
    > = [];
    const firstWindowListener = vi.fn();
    const secondWindowListener = vi.fn();
    const registry = new FileContentWatchRegistry({
      watch: (_path, _options, callback) => {
        watchListeners.push(callback);
        return { close };
      },
      readFile: vi.fn().mockResolvedValue("updated"),
      debounceMs: 80,
    });

    registry.watchFile(1, "notes/daily.md", firstWindowListener);
    registry.watchFile(2, "notes/daily.md", secondWindowListener);
    registry.watchFile(1, "notes/daily.md", firstWindowListener);

    expect(watchListeners).toHaveLength(1);
    watchListeners[0]("change", "daily.md");
    vi.advanceTimersByTime(80);
    await vi.runAllTimersAsync();

    expect(firstWindowListener).toHaveBeenCalledWith(
      "notes/daily.md",
      "updated",
    );
    expect(secondWindowListener).toHaveBeenCalledWith(
      "notes/daily.md",
      "updated",
    );
    registry.unwatchFile(1, "notes/daily.md");
    expect(close).not.toHaveBeenCalled();
    registry.unwatchFile(2, "notes/daily.md");
    expect(close).toHaveBeenCalledTimes(1);
  });
});
