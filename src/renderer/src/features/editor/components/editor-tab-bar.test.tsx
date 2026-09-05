import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore, type EditorTab } from "@/store/editor.store";
import { closeEditorTab } from "../lib/editor-tab-closing";
import { EditorTabBar } from "./editor-tab-bar";

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({ renameItem: vi.fn() }),
}));
vi.mock("./editor-toolbar", () => ({ EditorToolbar: () => null }));
vi.mock("../lib/editor-tab-closing", () => ({
  closeEditorTab: vi.fn(async () => true),
}));

describe("editor tab keyboard interaction", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    const tab: EditorTab = {
      id: "one",
      filePath: "/notes/one.md",
      pendingFilePath: null,
      content: "",
      wordCount: 0,
      isDirty: false,
      reloadKey: 0,
      mode: "rich",
      loadStatus: "ready",
      saveStatus: "clean",
      errorMessage: null,
      parseErrorMessage: null,
      scrollTop: 0,
    };
    useEditorStore.setState({
      activeGroupId: "group",
      panelGroups: [
        {
          id: "group",
          direction: "horizontal",
          activeTabId: "one",
          tabs: [tab, { ...tab, id: "two", filePath: "/notes/two.md" }],
        },
      ],
    });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("moves selection and focus with arrows, Home and End", () => {
    render(<EditorTabBar groupId="group" />);
    const [one, two] = screen.getAllByRole("tab");
    expect(one).toHaveAttribute("aria-selected", "true");
    expect(two).toHaveAttribute("tabindex", "-1");
    one.focus();
    fireEvent.keyDown(one, { key: "ArrowRight" });
    expect(two).toHaveFocus();
    expect(two).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(two, { key: "ArrowRight" });
    expect(one).toHaveFocus();
    fireEvent.keyDown(one, { key: "End" });
    expect(two).toHaveFocus();
    fireEvent.keyDown(two, { key: "Home" });
    expect(one).toHaveFocus();
    expect(useEditorStore.getState().panelGroups[0].activeTabId).toBe("one");
  });

  it("exposes named close controls and a direct new tab action", () => {
    render(<EditorTabBar groupId="group" />);
    expect(screen.getByRole("button", { name: "关闭 one.md" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "Delete" });
    expect(closeEditorTab).toHaveBeenCalledWith("group", "one");
    fireEvent.click(screen.getByRole("button", { name: "新建标签页" }));
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("opens, navigates and dismisses the context menu without a mouse", () => {
    render(<EditorTabBar groupId="group" />);
    const tab = screen.getAllByRole("tab")[0];
    tab.focus();
    fireEvent.keyDown(tab, { key: "F10", shiftKey: true });
    const close = screen.getByRole("menuitem", { name: "关闭" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "重命名" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(tab).toHaveFocus();
  });
});
