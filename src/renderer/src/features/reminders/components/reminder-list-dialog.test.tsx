import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useReminderStore } from "@/store/reminder.store";
import { ReminderListDialog } from "./reminder-list-dialog";

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
      isListOpen: false,
      isEditorOpen: true,
      editingReminderId: null,
      draftFilePath: null,
    });
  });
});
