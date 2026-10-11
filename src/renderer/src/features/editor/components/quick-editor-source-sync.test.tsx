import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { QuickEditorWindowContent } from "@shared/types";
import { QuickEditorWindow } from "./quick-editor-window";

const gate = vi.hoisted(() => ({ remoteReady: null as Promise<void> | null }));
vi.mock("../lib/markdown", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/markdown")>();
  return {
    ...original,
    parseMarkdown: async (
      ...args: Parameters<typeof original.parseMarkdown>
    ) => {
      if (args[1] === "REMOTE" && gate.remoteReady) await gate.remoteReady;
      return original.parseMarkdown(...args);
    },
  };
});
vi.mock("./quick-editor-actions-menu", () => ({
  QuickEditorActionsMenu: (props: { onToggleEditorMode: () => void }) => (
    <button onClick={props.onToggleEditorMode}>切换模式</button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  gate.remoteReady = null;
  Reflect.deleteProperty(document, "elementsFromPoint");
});

async function renderSource() {
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [],
  });
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  let receive!: (content: QuickEditorWindowContent) => void;
  const source = { groupId: "audit-group", tabId: "audit-tab", filePath: null };
  const sync = vi.fn();
  vi.stubGlobal("electronAPI", {
    getQuickEditorCollapsed: async () => false,
    onQuickEditorInitialContent: (
      callback: (content: QuickEditorWindowContent) => void,
    ) => {
      callback({ content: "INITIAL", source });
      return () => {};
    },
    onQuickEditorContentUpdated: (callback: typeof receive) => {
      receive = callback;
      return () => {};
    },
    updateDirtyState: vi.fn(),
    syncQuickEditorContent: sync,
  });
  render(<QuickEditorWindow />);
  await screen.findByText("INITIAL");
  fireEvent.click(screen.getByRole("button", { name: "切换模式" }));
  const input = await screen.findByRole("textbox", { name: "Markdown 源码" });
  return { input, source, receive, sync };
}

it("retains newer source input while an older remote update is parsing", async () => {
  const { input, source, receive, sync } = await renderSource();
  let release!: () => void;
  gate.remoteReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  act(() => receive({ content: "REMOTE", source }));
  fireEvent.change(input, { target: { value: "LOCAL NEWER" } });
  expect(sync).toHaveBeenLastCalledWith({ content: "LOCAL NEWER", source });
  await act(async () => {
    release();
  });
  await waitFor(() => expect(input).not.toHaveValue("INITIAL"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(input).toHaveValue("LOCAL NEWER");
});

it("finds and replaces the current source content", async () => {
  const { input, sync, source } = await renderSource();
  fireEvent.change(input, { target: { value: "Alpha Beta Alpha" } });
  fireEvent.keyDown(input, { key: "f", metaKey: true });
  const find = screen.getByPlaceholderText("查找");
  expect(find).toBeVisible();
  fireEvent.change(find, { target: { value: "Alpha" } });
  await waitFor(() => expect(screen.getByText("1/2")).toBeVisible());
  expect((input as HTMLTextAreaElement).selectionStart).toBe(0);
  expect((input as HTMLTextAreaElement).selectionEnd).toBe(5);
  fireEvent.click(screen.getByRole("button", { name: /下一个/ }));
  await waitFor(() =>
    expect((input as HTMLTextAreaElement).selectionStart).toBe(11),
  );
  fireEvent.click(screen.getByRole("button", { name: "展开替换" }));
  fireEvent.change(screen.getByPlaceholderText("替换"), {
    target: { value: "Gamma" },
  });
  fireEvent.click(screen.getByRole("button", { name: "替换全部匹配" }));
  await waitFor(() => expect(input).toHaveValue("Gamma Beta Gamma"));
  expect(sync).toHaveBeenLastCalledWith({
    content: "Gamma Beta Gamma",
    source,
  });
});
