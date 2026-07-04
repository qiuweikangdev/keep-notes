import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

    await user.click(screen.getByRole("button", { name: "取消" }));

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
    expect(screen.getByText("无关联文件")).toBeInTheDocument();
    expect(screen.getByText(/^通知 /)).toBeInTheDocument();
  });

  it("keeps the reminder list scroll area at 250px", () => {
    useReminderStore.setState({
      reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
    });
    render(<ReminderListDialog />);

    expect(screen.getByRole("tabpanel")).toHaveClass("h-[250px]");
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

    await user.type(screen.getByPlaceholderText("搜索标题或文件名"), "missing");

    expect(screen.queryByRole("button", { name: /Read notes/ })).toBeNull();

    act(() => {
      useReminderStore.getState().closeList();
    });
    act(() => {
      useReminderStore.getState().openList();
    });

    expect(screen.getByPlaceholderText("搜索标题或文件名")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /Read notes/ }),
    ).toBeInTheDocument();
  });
});
