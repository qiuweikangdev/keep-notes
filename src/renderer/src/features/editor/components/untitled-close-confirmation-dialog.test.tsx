import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { requestUntitledCloseConfirmation } from "../lib/editor-close-confirmation";
import { UntitledCloseConfirmationDialog } from "./untitled-close-confirmation-dialog";

describe("UntitledCloseConfirmationDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("resolves the discard action without using a native dialog", async () => {
    render(<UntitledCloseConfirmationDialog />);
    const result = requestUntitledCloseConfirmation("会议记录");

    await waitFor(() =>
      expect(
        screen.getByText("是否保存“会议记录”的更改？未保存的内容将会丢失。"),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "不保存" }));

    await expect(result).resolves.toBe("discard");
    await waitFor(() =>
      expect(
        screen.queryByText("是否保存“会议记录”的更改？未保存的内容将会丢失。"),
      ).not.toBeInTheDocument(),
    );
  });
});
