import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReminderStore } from "@/store/reminder.store";
import type { Reminder } from "@/types";
import { ReminderListDialog } from "./reminder-list-dialog";

const reminder: Reminder = {
  id: "reminder-1",
  title: "Read notes",
  filePath: "/workspace/notes/today.md",
  fileName: "today.md",
  scheduledAt: "2026-06-21T09:00:00.000Z",
  repeat: "never",
  completed: false,
  createdAt: "2026-06-21T08:00:00.000Z",
  updatedAt: "2026-06-21T08:00:00.000Z",
};

describe("ReminderListDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useReminderStore.setState({
      reminders: [],
      isEditorOpen: false,
      editingReminderId: null,
      draftFilePath: null,
      isListOpen: true,
      triggeredReminder: null,
    });
  });

  it("opens a standalone reminder editor from the search row", async () => {
    const user = userEvent.setup();
    render(<ReminderListDialog />);

    await user.click(screen.getByRole("button", { name: "新建提醒事项" }));

    expect(useReminderStore.getState()).toMatchObject({
      isListOpen: true,
      isEditorOpen: true,
      editingReminderId: null,
      draftFilePath: null,
    });
  });

  it("keeps the list visible but inert while the editor is open", () => {
    useReminderStore.setState({ isEditorOpen: true });
    render(<ReminderListDialog />);

    const dialog = screen.getByRole("dialog", { name: "提醒事项" });

    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute("data-editor-open", "true");
    expect(dialog).toHaveAttribute("inert");
    expect(dialog).toHaveClass("pointer-events-none");
    expect(dialog).not.toHaveClass(
      "opacity-60",
      "brightness-[0.82]",
      "saturate-75",
    );
    expect(screen.queryByTestId("reminder-list-editor-mask")).toBeNull();
  });

  it("keeps the reminder list open when selecting from a row context menu", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    fireEvent.contextMenu(screen.getByRole("button", { name: /Read notes/ }));
    expect(await screen.findByText("修改")).toBeInTheDocument();

    await user.click(screen.getByText("删除"));

    expect(useReminderStore.getState().isListOpen).toBe(true);
    expect(
      screen.getByRole("dialog", { name: "删除提醒事项" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toHaveAttribute(
      "data-variant",
      "outline",
    );
    expect(screen.getByRole("button", { name: "删除" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(
      screen.getByRole("dialog", { name: "提醒事项" }),
    ).toBeInTheDocument();
  });

  it("keeps the reminder list open when editing from a row context menu", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    fireEvent.contextMenu(screen.getByRole("button", { name: /Read notes/ }));
    expect(await screen.findByText("修改")).toBeInTheDocument();

    await user.click(screen.getByText("修改"));

    expect(useReminderStore.getState()).toMatchObject({
      isListOpen: true,
      isEditorOpen: true,
      editingReminderId: reminder.id,
    });
    expect(
      screen.getByRole("dialog", { name: "提醒事项" }),
    ).toBeInTheDocument();
  });

  it("keeps the reminder list open when dismissing a row context menu", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    fireEvent.contextMenu(screen.getByRole("button", { name: /Read notes/ }));
    expect(await screen.findByText("修改")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByText("修改")).not.toBeInTheDocument();
    expect(useReminderStore.getState().isListOpen).toBe(true);
    expect(
      screen.getByRole("dialog", { name: "提醒事项" }),
    ).toBeInTheDocument();
  });

  it("closes with Escape after dismissing a row context menu", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    fireEvent.contextMenu(screen.getByRole("button", { name: /Read notes/ }));
    expect(await screen.findByText("修改")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.keyboard("{Escape}");

    expect(useReminderStore.getState().isListOpen).toBe(false);
  });

  it("closes when clicking outside after dismissing a row context menu", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    fireEvent.contextMenu(screen.getByRole("button", { name: /Read notes/ }));
    expect(await screen.findByText("修改")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(useReminderStore.getState().isListOpen).toBe(false);
  });

  it("renders reminder metadata in a compact row", () => {
    useReminderStore.setState({
      reminders: [
        {
          ...reminder,
          fileName: "",
          scheduledAt: new Date().toISOString(),
          lastNotifiedAt: new Date().toISOString(),
        },
      ],
    });
    render(<ReminderListDialog />);

    expect(screen.queryByText("文件")).not.toBeInTheDocument();
    expect(screen.queryByText("时间")).not.toBeInTheDocument();
    expect(screen.queryByText("最近通知")).not.toBeInTheDocument();
    expect(screen.queryByText(/无关联文件/)).not.toBeInTheDocument();
    expect(screen.getByText(/^.* · 永不$/)).toBeInTheDocument();
    expect(screen.queryByText(/^提醒 /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^通知 /)).not.toBeInTheDocument();
  });

  it("renders a compact command-palette shell", () => {
    render(<ReminderListDialog />);

    const dialog = screen.getByRole("dialog", { name: "提醒事项" });
    const search = screen.getByRole("searchbox", {
      name: "搜索提醒事项",
    });

    expect(dialog).toHaveClass(
      "max-w-[520px]",
      "top-[12vh]",
      "w-[calc(100%-32px)]",
      "translate-y-0",
    );
    expect(dialog).toHaveClass("z-50", "shadow-[0_4px_8px_rgba(0,0,0,0.16)]");
    expect(search).toHaveClass("border-0", "bg-transparent");
    expect(screen.queryByRole("button", { name: "关闭" })).toBeNull();
    expect(screen.getByRole("button", { name: "新建提醒事项" })).toBeVisible();
  });

  it("uses a bounded compact result list", () => {
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    expect(screen.getByRole("tabpanel")).toHaveClass(
      "max-h-[320px]",
      "overflow-y-auto",
    );
  });

  it("renders an inline empty state", () => {
    render(<ReminderListDialog />);

    const emptyMessage = screen.getByText("没有提醒事项");

    expect(screen.getByRole("tabpanel")).toHaveClass("p-1.5");
    expect(emptyMessage.parentElement).toHaveClass(
      "h-8",
      "gap-2",
      "text-xs",
      "text-[var(--text-muted)]",
    );
  });

  it("renders compact tabs and search-style result rows", () => {
    useReminderStore.setState({
      reminders: [
        {
          ...reminder,
          fileName: "",
          scheduledAt: new Date().toISOString(),
        },
      ],
    });
    render(<ReminderListDialog />);

    expect(screen.getByRole("tablist")).toHaveClass("flex", "gap-1");
    expect(screen.getByRole("tab", { name: "今天" })).toHaveClass(
      "w-auto",
      "px-2.5",
    );
    expect(screen.getByRole("button", { name: /Read notes/ })).toHaveClass(
      "flex",
      "h-8",
    );
  });

  it("renders an associated file below the title as smaller secondary text", () => {
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    expect(screen.getByRole("button", { name: /Read notes/ })).toHaveClass(
      "h-11",
    );
    const fileName = screen.getByText("today.md");

    expect(fileName).toHaveClass("mt-0.5", "text-[10px]");
    expect(fileName.parentElement).toHaveClass("items-start");
    expect(screen.getByText(/^.* · 永不$/)).not.toHaveTextContent("today.md");
  });

  it("removes the history tab and keeps all reminders as the last tab", () => {
    render(<ReminderListDialog />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "今天",
      "完成",
      "全部",
    ]);
  });

  it("resets local filters every time the list opens", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    await user.type(screen.getByPlaceholderText("搜索提醒事项"), "missing");

    expect(screen.queryByRole("button", { name: /Read notes/ })).toBeNull();

    act(() => {
      useReminderStore.getState().closeList();
    });
    act(() => {
      useReminderStore.getState().openList();
    });

    expect(screen.getByPlaceholderText("搜索提醒事项")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /Read notes/ }),
    ).toBeInTheDocument();
  });

  it("marks the floating reminder surface as draggable", () => {
    render(<ReminderListDialog presentation="floating-window" />);

    const dialog = screen.getByRole("dialog");
    const results = screen.getByRole("tabpanel");

    expect(dialog).toHaveAttribute("data-floating-window", "true");
    expect(dialog).toHaveClass(
      "w-[calc(100%-16px)]",
      "max-h-[calc(100vh-16px)]",
    );
    expect(results).toHaveAttribute("data-reminder-scroll-region", "true");
    expect(results).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
      "overscroll-contain",
    );
  });

  it("restores the published floating reminder surface", () => {
    render(<ReminderListDialog presentation="floating-window" />);

    const dialog = screen.getByRole("dialog", { name: "提醒事项" });
    const header = dialog.querySelector<HTMLElement>(
      '[data-reminder-list-header="true"]',
    );
    expect(dialog.style.backgroundColor).toBe("var(--bg-primary)");
    expect(dialog.style.border).toBe("1px solid var(--border-color)");
    expect(dialog).toHaveClass("shadow-[0_4px_8px_rgba(0,0,0,0.16)]");
    expect(header).toHaveClass("border-b", "border-[var(--border-color)]");
    expect(header?.style.backgroundColor).toBe(
      "color-mix(in srgb, var(--bg-secondary) 24%, var(--bg-primary))",
    );
  });

  it("sizes a floating window from the full scrollable list height", () => {
    const previousElectronApi = Object.getOwnPropertyDescriptor(
      window,
      "electronAPI",
    );
    const resizeReminderWindow = vi.fn();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { resizeReminderWindow },
    });
    useReminderStore.setState({
      reminders: Array.from({ length: 12 }, (_, index) => ({
        ...reminder,
        id: `reminder-${index}`,
        scheduledAt: new Date().toISOString(),
      })),
    });

    try {
      render(<ReminderListDialog presentation="floating-window" />);

      expect(resizeReminderWindow).toHaveBeenCalledWith(419);
    } finally {
      if (previousElectronApi) {
        Object.defineProperty(window, "electronAPI", previousElectronApi);
      } else {
        Reflect.deleteProperty(window, "electronAPI");
      }
    }
  });

  it("opens a separate editor window from the floating create button", async () => {
    const user = userEvent.setup();
    const previousElectronApi = Object.getOwnPropertyDescriptor(
      window,
      "electronAPI",
    );
    const showReminderEditorWindow = vi.fn();

    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        ...window.electronAPI,
        showReminderEditorWindow,
      },
    });

    try {
      render(<ReminderListDialog presentation="floating-window" />);
      await user.click(screen.getByRole("button", { name: "新建提醒事项" }));

      expect(showReminderEditorWindow).toHaveBeenCalledWith();
      expect(useReminderStore.getState().isEditorOpen).toBe(false);
    } finally {
      if (previousElectronApi) {
        Object.defineProperty(window, "electronAPI", previousElectronApi);
      } else {
        Reflect.deleteProperty(window, "electronAPI");
      }
    }
  });

  it("returns to the main application from the floating header", async () => {
    const user = userEvent.setup();
    const previousElectronApi = Object.getOwnPropertyDescriptor(
      window,
      "electronAPI",
    );
    const returnToMainWindow = vi.fn();

    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        ...window.electronAPI,
        returnToMainWindow,
      },
    });

    try {
      render(<ReminderListDialog presentation="floating-window" />);
      const createButton = screen.getByRole("button", {
        name: "新建提醒事项",
      });
      const returnButton = screen.getByRole("button", { name: "返回应用" });
      await user.click(returnButton);

      expect(returnToMainWindow).toHaveBeenCalledOnce();
      expect(
        createButton.compareDocumentPosition(returnButton) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(returnButton.querySelector("svg")).toHaveClass("h-3.5", "w-3.5");
    } finally {
      if (previousElectronApi) {
        Object.defineProperty(window, "electronAPI", previousElectronApi);
      } else {
        Reflect.deleteProperty(window, "electronAPI");
      }
    }
  });
});
