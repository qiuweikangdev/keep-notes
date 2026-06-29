import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReminderStore } from "@/store/reminder.store";
import { ReminderEditorDialog } from "./reminder-editor-dialog";

describe("ReminderEditorDialog", () => {
  afterEach(() => {
    cleanup();
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

  it("creates a standalone reminder without requiring a file", async () => {
    const user = userEvent.setup();
    useReminderStore.setState({
      draftFilePath: null,
    });
    render(<ReminderEditorDialog />);

    const titleInput = screen.getByPlaceholderText("标题");
    expect(titleInput).toHaveClass("h-9", "px-3");
    expect(screen.queryByText(/\.md$/)).not.toBeInTheDocument();

    await user.type(titleInput, "喝水");
    await user.click(screen.getByRole("button", { name: "保存" }));

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
});
