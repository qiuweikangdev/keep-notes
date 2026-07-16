import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReminderStore } from "@/store/reminder.store";
import { ReminderEditorDialog } from "./reminder-editor-dialog";
import { ReminderListDialog } from "./reminder-list-dialog";

describe("ReminderEditorDialog", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      ...window.electronAPI,
      createReminder: vi.fn(async (input) => ({
        id: "reminder-standalone",
        title: input.title,
        filePath: input.filePath ?? "",
        fileName: "",
        scheduledAt: input.scheduledAt,
        repeat: input.repeat,
        customRepeat: input.customRepeat,
        completed: false,
        createdAt: "2026-06-21T08:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z",
      })),
    };
    useReminderStore.setState({
      reminders: [],
      isEditorOpen: true,
      editingReminderId: null,
      draftFilePath: "/workspace/notes/today.md",
      isListOpen: false,
    });
  });

  it("renders a compact layered editor with a clear form hierarchy", () => {
    render(<ReminderEditorDialog />);

    const dialog = screen.getByRole("dialog", { name: "新建提醒事项" });
    const titleInput = screen.getByRole("textbox", { name: "提醒标题" });
    const settingsGroup = screen.getByTestId("reminder-settings-group");
    const heading = screen.getByRole("heading", { name: "新建提醒事项" });
    const header = heading.parentElement;
    const scheduleControls = settingsGroup.querySelectorAll<HTMLElement>(
      'button[data-reminder-setting-control="true"]',
    );

    expect(dialog).toHaveClass(
      "top-[calc(12vh+56px)]",
      "max-w-[408px]",
      "translate-y-0",
    );
    expect(heading).toHaveClass(
      "flex",
      "items-center",
      "gap-2",
      "text-sm",
      "font-semibold",
    );
    expect(dialog.style.backgroundColor).toBe(
      "color-mix(in srgb, var(--bg-tertiary) 36%, var(--bg-primary))",
    );
    expect(header).toHaveClass(
      "h-11",
      "border-b",
      "border-[var(--border-color)]",
    );
    expect(screen.getByRole("button", { name: "关闭" })).toHaveClass(
      "h-7",
      "w-7",
      "rounded-md",
    );
    expect(titleInput).toHaveClass("h-9", "text-sm");
    expect(titleInput.style.border).toBe("1px solid var(--border-color)");
    scheduleControls.forEach((control) => {
      expect(control).toHaveClass("border");
      expect(control.style.borderColor).toBe("var(--border-color)");
    });
    expect(settingsGroup).toHaveClass(
      "mt-4",
      "space-y-2.5",
      "overflow-visible",
    );
    expect(settingsGroup).not.toHaveClass("border-y", "rounded-lg", "border");
    expect(settingsGroup).toContainElement(screen.getByText("日期"));
    expect(settingsGroup).toContainElement(screen.getByText("时间"));
    expect(settingsGroup).toContainElement(screen.getByText("重复"));
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("uses an explicit primary action with the existing disabled rule", () => {
    render(<ReminderEditorDialog />);

    const saveButton = screen.getByRole("button", { name: "保存提醒" });
    const cancelButton = screen.getByRole("button", { name: "取消" });
    const footer = saveButton.parentElement;

    expect(saveButton).toBeDisabled();
    expect(cancelButton).toHaveAttribute("data-variant", "secondary");
    expect(saveButton).toHaveAttribute("data-variant", "default");
    expect(footer).toHaveClass(
      "border-t",
      "border-[var(--border-color)]",
      "py-3",
    );
    expect(footer?.style.backgroundColor).toBe(
      "color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))",
    );
  });

  it("renders the associated file as muted secondary text", () => {
    render(<ReminderEditorDialog />);

    expect(screen.getByText("today.md")).toHaveClass(
      "text-[11px]",
      "text-[var(--text-muted)]",
    );
  });

  it("shows the edit heading when editing an existing reminder", () => {
    useReminderStore.setState({
      reminders: [
        {
          id: "reminder-1",
          title: "Review notes",
          filePath: "/workspace/notes/today.md",
          fileName: "today.md",
          scheduledAt: "2026-06-21T09:00:00.000Z",
          repeat: "never",
          completed: false,
          createdAt: "2026-06-21T08:00:00.000Z",
          updatedAt: "2026-06-21T08:00:00.000Z",
        },
      ],
      editingReminderId: "reminder-1",
    });

    render(<ReminderEditorDialog />);

    expect(screen.getByRole("heading", { name: "修改提醒事项" })).toBeVisible();
  });

  it("keeps the previous repeat option when cancelling custom repeat", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog />);

    await user.click(screen.getByRole("button", { name: /永不/ }));
    await user.click(screen.getByRole("button", { name: "自定义" }));
    await user.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "自定义重复" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /永不/ })).toBeInTheDocument();
    expect(screen.queryByText(/点击修改/)).not.toBeInTheDocument();
  });

  it("keeps the reminder editor open when the custom repeat dialog closes", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog />);

    await user.click(screen.getByRole("button", { name: /永不/ }));
    await user.click(screen.getByRole("button", { name: "自定义" }));

    await user.click(screen.getAllByRole("button", { name: "取消" }).at(-1)!);

    expect(useReminderStore.getState().isEditorOpen).toBe(true);
    expect(
      screen.getByRole("dialog", { name: "新建提醒事项" }),
    ).toBeInTheDocument();
  });

  it("keeps the editor open after selecting a repeat preset", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog />);

    await user.click(screen.getByRole("button", { name: /永不/ }));
    await user.click(screen.getByRole("button", { name: "每天" }));

    expect(useReminderStore.getState().isEditorOpen).toBe(true);
    expect(
      screen.getByRole("dialog", { name: "新建提醒事项" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /每天/ })).toBeInTheDocument();
  });

  it("closes repeat options when clicking elsewhere in the editor", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog presentation="floating-window" />);

    await user.click(screen.getByRole("button", { name: /永不/ }));
    expect(screen.getByRole("button", { name: "每小时" })).toBeInTheDocument();

    const settingsGroup = screen.getByTestId("reminder-settings-group");
    expect(settingsGroup.parentElement).toHaveAttribute(
      "data-reminder-editor-interactive-region",
      "true",
    );
    await user.click(screen.getByText("日期"));

    expect(
      screen.queryByRole("button", { name: "每小时" }),
    ).not.toBeInTheDocument();
    expect(useReminderStore.getState().isEditorOpen).toBe(true);
  });

  it("limits native window dragging to the floating editor header", () => {
    render(<ReminderEditorDialog presentation="floating-window" />);

    const heading = screen.getByRole("heading", { name: "新建提醒事项" });
    const dialog = screen.getByRole("dialog", { name: "新建提醒事项" });

    expect(dialog).toHaveAttribute("data-floating-window", "true");
    expect(
      heading.closest('[data-reminder-editor-drag-region="true"]'),
    ).toBeInTheDocument();
  });

  it("closes repeat options when the editor window loses focus", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog presentation="floating-window" />);

    await user.click(screen.getByRole("button", { name: /永不/ }));
    expect(screen.getByRole("button", { name: "每小时" })).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event("blur")));

    expect(
      screen.queryByRole("button", { name: "每小时" }),
    ).not.toBeInTheDocument();
    expect(useReminderStore.getState().isEditorOpen).toBe(true);
  });

  it("uses normal weight for repeat menu options", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog />);

    await user.click(screen.getByRole("button", { name: /永不/ }));

    expect(screen.getAllByRole("button", { name: "永不" }).at(-1)).toHaveClass(
      "font-normal",
    );
  });

  it("keeps the bordered repeat menu above its trigger", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog presentation="floating-window" />);

    await user.click(screen.getByRole("button", { name: /永不/ }));

    const menu = screen.getByTestId("reminder-repeat-menu");
    const options = menu.firstElementChild;

    expect(menu).toHaveClass("bottom-[calc(100%+8px)]", "border", "shadow-lg");
    expect(menu.style.backgroundColor).toBe("var(--bg-primary)");
    expect(menu.style.borderColor).toBe("var(--border-color)");
    expect(options).toHaveClass("max-h-[240px]", "overflow-y-auto");
  });

  it("renders date, time, and repeat as compact independent rows", () => {
    render(<ReminderEditorDialog />);

    const settingsGroup = screen.getByTestId("reminder-settings-group");
    const scheduleRows = screen.getAllByTestId("reminder-schedule-row");
    const controls = settingsGroup.querySelectorAll(
      'button[data-reminder-setting-control="true"]',
    );

    expect(scheduleRows).toHaveLength(3);
    scheduleRows.forEach((row) => {
      expect(row).toHaveClass("grid-cols-[48px_minmax(0,1fr)]", "gap-3");
    });
    expect(controls).toHaveLength(3);
    controls.forEach((control) => {
      expect(control).toHaveClass("h-9", "w-full");
      expect(control).not.toHaveAttribute("data-theme-control");
    });
  });

  it("creates a standalone reminder without requiring a file", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      draftFilePath: null,
    });
    render(<ReminderEditorDialog />);

    const titleInput = screen.getByPlaceholderText("输入提醒内容");
    expect(titleInput).toHaveClass("h-9", "px-3");
    expect(screen.queryByText(/\.md$/)).not.toBeInTheDocument();

    await user.type(titleInput, "喝水");
    await user.click(screen.getByRole("button", { name: "保存提醒" }));

    await waitFor(() => {
      expect(window.electronAPI.createReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "喝水",
          filePath: "",
          repeat: "never",
        }),
      );
    });
  });

  it("only closes the editor when cancelling from an open list", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      isEditorOpen: false,
      isListOpen: true,
      draftFilePath: null,
    });
    render(
      <>
        <ReminderListDialog />
        <ReminderEditorDialog />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "新建提醒事项" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(useReminderStore.getState()).toMatchObject({
      isEditorOpen: false,
      isListOpen: true,
    });
  });

  it("only closes the editor when clicking outside from an open list", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      isEditorOpen: false,
      isListOpen: true,
      draftFilePath: null,
    });
    render(
      <>
        <ReminderEditorDialog />
        <ReminderListDialog />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "新建提醒事项" }));
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(useReminderStore.getState()).toMatchObject({
      isEditorOpen: false,
      isListOpen: true,
    });
  });

  it("only closes the editor when saving from an open list", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      isEditorOpen: false,
      isListOpen: true,
      draftFilePath: null,
    });
    render(
      <>
        <ReminderListDialog />
        <ReminderEditorDialog />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "新建提醒事项" }));
    await user.type(screen.getByPlaceholderText("输入提醒内容"), "喝水");
    await user.click(screen.getByRole("button", { name: "保存提醒" }));

    await waitFor(() => {
      expect(useReminderStore.getState()).toMatchObject({
        isEditorOpen: false,
        isListOpen: true,
      });
    });
  });

  it("refreshes the default time every time the create dialog opens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T08:02:00"));
    useReminderStore.setState({
      draftFilePath: null,
    });
    render(<ReminderEditorDialog />);

    expect(screen.getByRole("button", { name: /08:02/ })).toBeInTheDocument();

    act(() => {
      useReminderStore.getState().closeEditor();
    });
    vi.setSystemTime(new Date("2026-06-21T09:17:00"));
    act(() => {
      useReminderStore.getState().openCreateDialog();
    });

    expect(screen.getByRole("button", { name: /09:17/ })).toBeInTheDocument();
  });

  it("resets nested popup state every time the editor opens", async () => {
    const user = userEvent.setup();
    render(<ReminderEditorDialog />);

    await user.click(screen.getByRole("button", { name: /永不/ }));
    await user.click(screen.getByRole("button", { name: "自定义" }));

    expect(screen.getAllByText("自定义重复").length).toBeGreaterThan(0);

    act(() => {
      useReminderStore.getState().closeEditor();
    });
    act(() => {
      useReminderStore.getState().openCreateDialog();
    });

    expect(screen.queryByText("自定义重复")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /永不/ })).toBeInTheDocument();
  });

  it("scrolls the time picker columns to the current time when opened", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-21T11:05:00"));
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      useReminderStore.setState({
        draftFilePath: null,
      });
      render(<ReminderEditorDialog />);

      fireEvent.click(screen.getByRole("button", { name: /11:05/ }));

      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        behavior: "auto",
      });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});
