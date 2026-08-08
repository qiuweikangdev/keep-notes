import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/constants";
import { registerQuickEditorIpc } from "./quick-editor.ipc";

const ipcMainMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
}));

const quickEditorMocks = vi.hoisted(() => ({
  closeQuickEditorWindow: vi.fn(),
  configureQuickEditorGlobalShortcuts: vi.fn(),
  consumePendingQuickEditorContent: vi.fn(),
  createQuickEditorWindow: vi.fn(),
  detachQuickEditorSource: vi.fn(),
  flushQuickEditorContent: vi.fn(),
  getQuickEditorCollapsed: vi.fn(),
  returnToMainWindowFromQuickEditor: vi.fn(),
  setQuickEditorCollapsed: vi.fn(),
  showQuickEditorWindow: vi.fn(),
  syncQuickEditorContent: vi.fn(),
}));

const utilsMocks = vi.hoisted(() => ({
  getBrowserWindow: vi.fn(),
}));

vi.mock("electron", () => ({ ipcMain: ipcMainMocks }));
vi.mock("../quick-editor-window", () => quickEditorMocks);
vi.mock("../utils", () => utilsMocks);

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

function getHandler(channel: string): IpcHandler {
  const handler = ipcMainMocks.handle.mock.calls.find(
    ([name]) => name === channel,
  )?.[1];
  if (typeof handler !== "function") {
    throw new Error(`Missing IPC handler: ${channel}`);
  }
  return handler as IpcHandler;
}

function getListener(channel: string): IpcHandler {
  const listener = ipcMainMocks.on.mock.calls.find(
    ([name]) => name === channel,
  )?.[1];
  if (typeof listener !== "function") {
    throw new Error(`Missing IPC listener: ${channel}`);
  }
  return listener as IpcHandler;
}

describe("quick editor collapse IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerQuickEditorIpc();
  });

  it("reads collapse state from the sender's quick-editor window", () => {
    const win = { id: "quick-editor" };
    const event = { sender: { id: 7 } };
    utilsMocks.getBrowserWindow.mockReturnValue(win);
    quickEditorMocks.getQuickEditorCollapsed.mockReturnValue(true);

    const handler = getHandler(IPC_CHANNELS.QUICK_EDITOR.GET_COLLAPSED);

    expect(handler(event)).toBe(true);
    expect(quickEditorMocks.getQuickEditorCollapsed).toHaveBeenCalledWith(win);
  });

  it("validates booleans before changing collapse state", async () => {
    const win = { id: "quick-editor" };
    const event = { sender: { id: 8 } };
    utilsMocks.getBrowserWindow.mockReturnValue(win);
    quickEditorMocks.setQuickEditorCollapsed.mockResolvedValue(true);
    const handler = getHandler(IPC_CHANNELS.QUICK_EDITOR.SET_COLLAPSED);

    await expect(handler(event, true, false)).resolves.toBe(true);
    expect(quickEditorMocks.setQuickEditorCollapsed).toHaveBeenCalledWith(
      win,
      true,
      false,
    );

    expect(handler(event, "true", false)).toBe(false);
    expect(handler(event, true, "false")).toBe(false);
    expect(quickEditorMocks.setQuickEditorCollapsed).toHaveBeenCalledTimes(1);
  });

  it("detaches a source after its main-window tab closes", () => {
    const source = {
      groupId: "group-1",
      tabId: "tab-1",
      filePath: "/notes/readme.md",
    };

    getListener(IPC_CHANNELS.QUICK_EDITOR.DETACH_SOURCE)({}, source);

    expect(quickEditorMocks.detachQuickEditorSource).toHaveBeenCalledWith(
      source,
    );
  });
});
