import { describe, expect, it, vi } from "vitest";
import { CodeResult } from "@/types";
import { useEditorStore } from "@/store/editor.store";
import { discardFileChanges } from "./discard-file-changes";

describe("discardFileChanges", () => {
  it("returns noChanges without discarding when git status has no matching file", async () => {
    useEditorStore.setState({ panelGroups: [] });
    const electron = {
      getGitStatus: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
        data: {
          current: "main",
          tracking: "",
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
        },
      }),
      discardChanges: vi.fn(),
      loadTree: vi.fn(),
    } as unknown as Parameters<typeof discardFileChanges>[2];

    const result = await discardFileChanges(
      "/notes",
      "/notes/readme.md",
      electron,
    );

    expect(result).toEqual({ success: true, noChanges: true });
    expect(electron.discardChanges).not.toHaveBeenCalled();
    expect(electron.loadTree).not.toHaveBeenCalled();
  });
});
