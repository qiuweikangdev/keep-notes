import { describe, expect, it } from "vitest";

import type { EditorTab } from "@/store/editor.store";
import {
  beginFileTransition,
  completeFileTransition,
  failFileTransition,
} from "./editor-file-transition";

describe("editor file transition", () => {
  it("keeps the current document visible while the next file loads", () => {
    const current = { ...createTab(), scrollTop: 280 };
    const loading = beginFileTransition(current, "b.md");

    expect(loading).toMatchObject({
      filePath: "a.md",
      content: "# A",
      pendingFilePath: "b.md",
      loadStatus: "loading",
      scrollTop: 0,
    });
  });

  it("atomically swaps the path and content when the target is ready", () => {
    const loading = beginFileTransition(createTab(), "b.md");
    const completed = completeFileTransition(loading, "b.md", "# B");

    expect(completed).toMatchObject({
      filePath: "b.md",
      content: "# B",
      pendingFilePath: null,
      loadStatus: "ready",
    });
  });

  it("preserves an explicitly selected source mode when opening a file", () => {
    const unnamed = {
      ...createTab(),
      filePath: null,
      mode: "source" as const,
      loadStatus: "ready" as const,
    };

    expect(beginFileTransition(unnamed, "notes.md").mode).toBe("source");
  });

  it("resets scroll offset when the current file is refreshed externally", () => {
    const current = { ...createTab(), scrollTop: 320 };
    const completed = completeFileTransition(current, "a.md", "# A updated");

    expect(completed).toMatchObject({
      filePath: "a.md",
      content: "# A updated",
      scrollTop: 0,
      loadStatus: "ready",
    });
  });

  it("resets scroll offset when switching to a different file", () => {
    const loading = beginFileTransition(
      { ...createTab(), scrollTop: 320 },
      "b.md",
    );
    const completed = completeFileTransition(loading, "b.md", "# B");

    expect(completed.scrollTop).toBe(0);
  });

  it("ignores a stale completion for another target", () => {
    const loading = beginFileTransition(createTab(), "b.md");

    expect(completeFileTransition(loading, "c.md", "# C")).toBe(loading);
  });

  it("keeps the current document after a failed background switch", () => {
    const loading = beginFileTransition(createTab(), "b.md");
    const failed = failFileTransition(loading, "b.md", "read failed");

    expect(failed).toMatchObject({
      filePath: "a.md",
      content: "# A",
      pendingFilePath: null,
      loadStatus: "ready",
      errorMessage: "read failed",
    });
  });
});

function createTab(): EditorTab {
  return {
    id: "tab-1",
    filePath: "a.md",
    pendingFilePath: null,
    content: "# A",
    wordCount: 3,
    isDirty: false,
    reloadKey: 0,
    mode: "rich",
    loadStatus: "ready",
    saveStatus: "clean",
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
  };
}
