import { describe, expect, it, vi } from "vitest";
import { CodeResult } from "@/types";
import { GIT_STATUS_CHANGE_EVENT } from "@/features/git/lib/git-status-change";
import {
  useEditorStore,
  type EditorPanelGroup,
  type EditorTab,
} from "@/store/editor.store";
import { editorSaveCoordinator } from "./editor-runtime";
import { discardFileChanges } from "./discard-file-changes";

function createEditorTab(
  id: string,
  filePath: string,
  content: string,
): EditorTab {
  return {
    id,
    filePath,
    pendingFilePath: null,
    content,
    wordCount: content.length,
    isDirty: true,
    reloadKey: 0,
    mode: "source",
    loadStatus: "ready",
    saveStatus: "dirty",
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
  };
}

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

  it("skips the stale status precheck when a visible diff already confirmed changes", async () => {
    useEditorStore.setState({ panelGroups: [] });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue("# restored"),
      },
    });
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
      discardChanges: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
      }),
      loadTree: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof discardFileChanges>[2];

    const statusChangeSpy = vi.fn();
    window.addEventListener(GIT_STATUS_CHANGE_EVENT, statusChangeSpy);
    const result = await discardFileChanges(
      "/notes",
      "/notes/readme.md",
      electron,
      { skipChangeCheck: true },
    );
    window.removeEventListener(GIT_STATUS_CHANGE_EVENT, statusChangeSpy);

    expect(result).toEqual({ success: true });
    expect(electron.discardChanges).toHaveBeenCalledWith("/notes", "readme.md");
    expect(statusChangeSpy).toHaveBeenCalledOnce();
    expect((statusChangeSpy.mock.calls[0][0] as CustomEvent).detail).toEqual({
      repositoryRoot: "/notes",
    });
  });

  it("discards a dirty editor tab when the diff supplies a repository-relative path", async () => {
    const panelGroup: EditorPanelGroup = {
      id: "group-1",
      activeTabId: "tab-1",
      direction: "horizontal",
      tabs: [
        {
          id: "tab-1",
          filePath: "/notes/auth.md",
          pendingFilePath: null,
          content: "",
          wordCount: 0,
          isDirty: true,
          reloadKey: 0,
          mode: "source",
          loadStatus: "ready",
          saveStatus: "dirty",
          errorMessage: null,
          parseErrorMessage: null,
          scrollTop: 0,
        },
      ],
    };
    useEditorStore.setState({ panelGroups: [panelGroup] });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue("# restored"),
      },
    });
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
      discardChanges: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
      }),
      loadTree: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof discardFileChanges>[2];

    const result = await discardFileChanges("/notes", "auth.md", electron);

    expect(result).toEqual({ success: true });
    expect(electron.discardChanges).toHaveBeenCalledWith("/notes", "auth.md");
    expect(window.electronAPI.readFile).toHaveBeenCalledWith("/notes/auth.md");
    expect(useEditorStore.getState().panelGroups[0].tabs[0]).toMatchObject({
      filePath: "/notes/auth.md",
      content: "# restored",
      isDirty: false,
      saveStatus: "clean",
    });
  });

  it("discards editor content that differs from HEAD when dirty state and Git status are clean", async () => {
    const tab = createEditorTab(
      "tab-1",
      "/notes/aaa.md",
      "```javascript\nconst a = 1\n```\n\n222",
    );
    tab.isDirty = false;
    tab.saveStatus = "clean";
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group-1",
          activeTabId: tab.id,
          direction: "horizontal",
          tabs: [tab],
        },
      ],
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue("```javascript\nconst a = 1\n```"),
      },
    });
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
      getFileHeadContent: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
        data: "```javascript\nconst a = 1\n```",
      }),
      discardChanges: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
      }),
      loadTree: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof discardFileChanges>[2];

    const result = await discardFileChanges(
      "/notes",
      "/notes/aaa.md",
      electron,
    );

    expect(result).toEqual({ success: true });
    expect(electron.discardChanges).toHaveBeenCalledWith("/notes", "aaa.md");
    expect(useEditorStore.getState().panelGroups[0].tabs[0]).toMatchObject({
      content: "```javascript\nconst a = 1\n```",
      isDirty: false,
      saveStatus: "clean",
    });
  });

  it("restores a Windows tab that uses separators different from the repository root", async () => {
    const panelGroup: EditorPanelGroup = {
      id: "group-1",
      activeTabId: "tab-1",
      direction: "horizontal",
      tabs: [
        {
          id: "tab-1",
          filePath: "C:/notes/auth.md",
          pendingFilePath: null,
          content: "changed",
          wordCount: 7,
          isDirty: true,
          reloadKey: 0,
          mode: "source",
          loadStatus: "ready",
          saveStatus: "dirty",
          errorMessage: null,
          parseErrorMessage: null,
          scrollTop: 0,
        },
      ],
    };
    useEditorStore.setState({ panelGroups: [panelGroup] });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue("restored"),
      },
    });
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
      discardChanges: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
      }),
      loadTree: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof discardFileChanges>[2];

    editorSaveCoordinator.schedule("C:/notes/auth.md", "changed");
    await discardFileChanges("C:\\notes", "auth.md", electron);

    expect(editorSaveCoordinator.hasPending("C:/notes/auth.md")).toBe(false);
    expect(window.electronAPI.readFile).toHaveBeenCalledWith(
      "C:\\notes\\auth.md",
    );
    expect(useEditorStore.getState().panelGroups[0].tabs[0]).toMatchObject({
      filePath: "C:/notes/auth.md",
      content: "restored",
      isDirty: false,
      saveStatus: "clean",
    });
  });

  it("keeps a differently-cased POSIX file untouched when an untracked file is discarded", async () => {
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "lowercase-tab",
          direction: "horizontal",
          tabs: [
            createEditorTab("uppercase-tab", "/notes/Auth.md", "keep me"),
            createEditorTab("lowercase-tab", "/notes/auth.md", "discard me"),
          ],
        },
      ],
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        readFile: vi.fn().mockRejectedValue(new Error("file deleted")),
      },
    });
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
          not_added: ["auth.md"],
          modified: [],
          deleted: [],
          renamed: [],
          staged: [],
          conflicted: [],
        },
      }),
      discardChanges: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
      }),
      loadTree: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof discardFileChanges>[2];

    await discardFileChanges("/notes", "auth.md", electron);

    const [uppercaseTab, lowercaseTab] =
      useEditorStore.getState().panelGroups[0].tabs;
    expect(uppercaseTab).toMatchObject({
      filePath: "/notes/Auth.md",
      content: "keep me",
      isDirty: true,
    });
    expect(lowercaseTab).toMatchObject({
      filePath: null,
      content: "",
      isDirty: false,
    });
  });

  it("waits for an in-flight editor save before restoring the Git version", async () => {
    let finishWrite: (() => void) | undefined;
    const writePromise = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group-1",
          activeTabId: "tab-1",
          direction: "horizontal",
          tabs: [
            {
              id: "tab-1",
              filePath: "/notes/auth.md",
              pendingFilePath: null,
              content: "stale edit",
              wordCount: 10,
              isDirty: true,
              reloadKey: 0,
              mode: "source",
              loadStatus: "ready",
              saveStatus: "saving",
              errorMessage: null,
              parseErrorMessage: null,
              scrollTop: 0,
            },
          ],
        },
      ],
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        writeFile: vi.fn().mockReturnValue(writePromise),
        readFile: vi.fn().mockResolvedValue("restored"),
      },
    });
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
          modified: ["auth.md"],
          deleted: [],
          renamed: [],
          staged: [],
          conflicted: [],
        },
      }),
      discardChanges: vi.fn().mockResolvedValue({
        code: CodeResult.Success,
      }),
      loadTree: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof discardFileChanges>[2];

    editorSaveCoordinator.schedule("/notes/auth.md", "stale edit");
    const flushPromise = editorSaveCoordinator.flush("/notes/auth.md");
    const discardPromise = discardFileChanges("/notes", "auth.md", electron);

    try {
      await vi.waitFor(() => {
        expect(electron.getGitStatus).toHaveBeenCalled();
      });
      expect(electron.discardChanges).not.toHaveBeenCalled();

      finishWrite?.();
      await Promise.all([flushPromise, discardPromise]);

      expect(electron.discardChanges).toHaveBeenCalledWith("/notes", "auth.md");
    } finally {
      finishWrite?.();
      await flushPromise;
      editorSaveCoordinator.cancel("/notes/auth.md");
    }
  });
});
