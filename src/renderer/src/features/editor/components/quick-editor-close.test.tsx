import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  CloseSaveSnapshot,
  QuickEditorSaveState,
  QuickEditorWindowContent,
} from "@shared/types";
import { QuickEditorWindow } from "./quick-editor-window";

vi.mock("./quick-editor-actions-menu", () => ({
  QuickEditorActionsMenu: (props: { onToggleEditorMode: () => void }) => (
    <button onClick={props.onToggleEditorMode}>切换模式</button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "elementsFromPoint");
});

it("preserves the unsaved draft close snapshot across mode switches", async () => {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  const updateDirtyState = vi.fn();
  vi.stubGlobal("electronAPI", {
    getQuickEditorCollapsed: async () => false,
    onQuickEditorInitialContent: (
      callback: (value: { content: string; source: null }) => void,
    ) => {
      callback({ content: "未保存草稿", source: null });
      return () => {};
    },
    onQuickEditorContentUpdated: () => () => {},
    updateDirtyState,
    syncQuickEditorContent: vi.fn(),
  });
  const bridge = window as unknown as Window & {
    __getNextDirtyEditor: () => Promise<CloseSaveSnapshot | null>;
  };
  render(<QuickEditorWindow />);
  await screen.findByText("未保存草稿");
  await waitFor(() => expect(updateDirtyState).toHaveBeenLastCalledWith(true));
  updateDirtyState.mockClear();

  fireEvent.click(screen.getByRole("button", { name: "切换模式" }));
  const source = await screen.findByRole("textbox", { name: "Markdown 源码" });
  expect(await bridge.__getNextDirtyEditor()).toMatchObject({
    content: "未保存草稿",
  });
  expect(updateDirtyState).not.toHaveBeenCalledWith(false);

  fireEvent.change(source, { target: { value: "更新后的草稿" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "切换模式" }));
  });
  await screen.findByText("更新后的草稿");
  expect(await bridge.__getNextDirtyEditor()).toMatchObject({
    content: "更新后的草稿",
  });
  expect(updateDirtyState).not.toHaveBeenCalledWith(false);
});

it("shows a save failure and retries the live linked content", async () => {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
  let receiveState!: (state: QuickEditorSaveState) => void;
  const source = {
    groupId: "group",
    tabId: "tab",
    filePath: "/notes/draft.md",
  };
  const sync = vi.fn();
  const flush = vi.fn(async () => {});
  vi.stubGlobal("electronAPI", {
    getQuickEditorCollapsed: async () => false,
    onQuickEditorInitialContent: (
      callback: (content: QuickEditorWindowContent) => void,
    ) => {
      callback({ content: "草稿", source });
      return () => {};
    },
    onQuickEditorContentUpdated: () => () => {},
    onQuickEditorSaveState: (callback: typeof receiveState) => {
      receiveState = callback;
      return () => {};
    },
    updateDirtyState: vi.fn(),
    syncQuickEditorContent: sync,
    flushQuickEditorContent: flush,
  });
  render(<QuickEditorWindow />);
  await screen.findByText("草稿");
  act(() => receiveState({ filePath: source.filePath, error: "磁盘已满" }));
  expect(screen.getByRole("alert")).toHaveTextContent("磁盘已满");
  fireEvent.click(screen.getByRole("button", { name: "切换模式" }));
  const input = await screen.findByRole("textbox", { name: "Markdown 源码" });
  fireEvent.change(input, { target: { value: "最后一次修改" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "重试保存" }));
  });
  expect(sync).toHaveBeenLastCalledWith({ source, content: "最后一次修改" });
  expect(flush).toHaveBeenCalledWith(source);
  expect(screen.queryByRole("alert")).toBeNull();
});
