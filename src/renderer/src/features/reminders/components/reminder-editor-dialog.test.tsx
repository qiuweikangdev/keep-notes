import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReminderStore } from "@/store/reminder.store";
import { ReminderEditorDialog } from "./reminder-editor-dialog";

describe("ReminderEditorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
