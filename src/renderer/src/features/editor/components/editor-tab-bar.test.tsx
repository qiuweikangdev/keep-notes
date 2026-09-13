import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore, type EditorTab } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { useUIStore } from "@/store/ui.store";
import { closeEditorTab } from "../lib/editor-tab-closing";
import { EditorTabBar } from "./editor-tab-bar";
import { editorSaveCoordinator } from "../lib/editor-runtime";
import { showAppToast } from "@/lib/app-toast";

const tabMocks = vi.hoisted(() => ({ renameItem: vi.fn() }));
vi.mock("@/lib/app-toast", () => ({ showAppToast: vi.fn() }));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({ renameItem: tabMocks.renameItem }),
}));
vi.mock("./editor-toolbar", () => ({
  EditorToolbar: () => <button type="button" aria-label="标签页操作" />,
}));
vi.mock("../lib/editor-tab-closing", () => ({
  closeEditorTab: vi.fn(async () => true),
}));

describe("editor tab keyboard interaction", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ layout: "classic" });
    useTreeStore.setState({ treeRoot: null });
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

  it("keeps the original file path when saving before a rename fails", async () => {
    vi.spyOn(editorSaveCoordinator, "flush").mockResolvedValueOnce(false);
    useEditorStore.getState().setTabDirty("group", "one", true);
    render(<EditorTabBar groupId="group" />);
    fireEvent.contextMenu(screen.getAllByRole("tab")[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = screen.getByRole("textbox", { name: "重命名文件" });
    fireEvent.change(input, { target: { value: "renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(showAppToast).toHaveBeenCalledWith(
        expect.stringContaining("文件尚未重命名"),
      ),
    );
    expect(tabMocks.renameItem).not.toHaveBeenCalled();
    const tab = useEditorStore.getState().panelGroups[0].tabs[0];
    expect(tab.filePath).toBe("/notes/one.md");
    expect(tab.isDirty).toBe(true);
  });

  it("exposes named close controls without a standalone new tab action", () => {
    render(<EditorTabBar groupId="group" />);
    expect(
      screen.getByRole("button", { name: "标签页操作" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭 one.md" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "Delete" });
    expect(closeEditorTab).toHaveBeenCalledWith("group", "one");
    expect(
      screen.queryByRole("button", { name: "新建标签页" }),
    ).not.toBeInTheDocument();
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

  it("hides the configured toolbar actions in minimal layout", () => {
    useUIStore.setState({ layout: "minimal" });
    render(<EditorTabBar groupId="group" />);

    expect(
      screen.queryByRole("button", { name: "标签页操作" }),
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getAllByRole("tab")[0]);
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "关闭",
      "重命名",
      "新建标签页",
      "浮动窗口",
      "在资源管理器中显示",
      "编辑模式切换",
      "向右拆分",
      "向下拆分",
    ]);
  });

  it("applies migrated actions to the tab that opened the context menu", async () => {
    useUIStore.setState({ layout: "minimal" });
    render(<EditorTabBar groupId="group" />);

    fireEvent.contextMenu(screen.getAllByRole("tab")[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "编辑模式切换" }));

    await waitFor(() => {
      expect(useEditorStore.getState().panelGroups[0].tabs[1].mode).toBe(
        "source",
      );
    });
    expect(useEditorStore.getState().panelGroups[0].tabs[0].mode).toBe("rich");
  });

  it("keeps an empty minimal pane actionable from its context menu", () => {
    useUIStore.setState({ layout: "minimal" });
    useEditorStore.setState({
      panelGroups: [
        {
          id: "group",
          direction: "horizontal",
          activeTabId: "",
          tabs: [],
        },
      ],
    });
    render(<EditorTabBar groupId="group" />);

    fireEvent.contextMenu(screen.getByRole("tablist"));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["新建标签页", "向右拆分", "向下拆分"]);
  });
});
