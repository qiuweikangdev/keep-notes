import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomRepeatDialog } from "./custom-repeat-dialog";

describe("CustomRepeatDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits a custom repeat as one compact natural-language rule", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CustomRepeatDialog
        open
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "自定义重复" });
    const intervalInput = screen.getByRole("spinbutton", {
      name: "重复间隔",
    });

    expect(dialog).toHaveClass("max-w-[336px]", "rounded-xl");
    expect(screen.getByText("重复规则")).toBeVisible();
    expect(screen.getByRole("heading", { name: "自定义重复" })).toHaveClass(
      "flex",
      "items-center",
      "gap-2",
    );
    expect(intervalInput).toHaveClass("h-9", "w-16", "text-center");
    const unitPicker = screen.getByRole("button", { name: "重复单位" });
    expect(unitPicker).toHaveClass("h-9", "w-full");
    expect(unitPicker.parentElement?.parentElement).toHaveClass(
      "w-36",
      "shrink-0",
    );

    await user.clear(intervalInput);
    await user.type(intervalInput, "2");
    await user.click(screen.getByRole("button", { name: "重复单位" }));
    await user.click(screen.getByRole("button", { name: "周" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(onConfirm).toHaveBeenCalledWith({ interval: 2, unit: "week" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
