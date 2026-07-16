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
    const heading = screen.getByRole("heading", { name: "自定义重复" });
    const header = heading.parentElement;
    const unitPicker = screen.getByRole("button", { name: "重复单位" });
    const cancelButton = screen.getByRole("button", { name: "取消" });
    const footer = cancelButton.parentElement;

    expect(dialog).toHaveClass("max-w-[336px]", "rounded-xl");
    expect(screen.getByText("重复规则")).toBeVisible();
    expect(heading).toHaveClass("flex", "items-center", "gap-2");
    expect(header).toHaveClass(
      "h-11",
      "border-b",
      "border-[var(--border-color)]",
    );
    expect(intervalInput).toHaveClass("h-9", "w-20", "text-center", "border");
    expect(intervalInput.style.borderColor).toBe("var(--border-color)");
    expect(unitPicker).toHaveClass("h-9", "w-full");
    expect(unitPicker).toHaveClass("border");
    expect(unitPicker.style.borderColor).toBe("var(--border-color)");
    expect(unitPicker.parentElement?.parentElement).toHaveClass(
      "w-24",
      "shrink-0",
    );
    expect(cancelButton).toHaveAttribute("data-variant", "secondary");
    expect(footer).toHaveClass(
      "border-t",
      "border-[var(--border-color)]",
      "py-3",
    );
    expect(footer?.style.backgroundColor).toBe(
      "color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))",
    );

    await user.clear(intervalInput);
    await user.type(intervalInput, "2");
    await user.click(screen.getByRole("button", { name: "重复单位" }));
    await user.click(screen.getByRole("button", { name: "周" }));
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(onConfirm).toHaveBeenCalledWith({ interval: 2, unit: "week" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("provides a stable enlarged close-button hit area", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CustomRepeatDialog
        open
        onConfirm={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );

    const closeButton = screen.getByRole("button", { name: "关闭" });
    expect(closeButton).toHaveAttribute("data-custom-repeat-close", "true");
    expect(closeButton).toHaveClass("h-9", "w-9", "shrink-0");

    await user.click(closeButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses the published bordered repeat-unit menu", async () => {
    const user = userEvent.setup();

    render(
      <CustomRepeatDialog open onConfirm={vi.fn()} onOpenChange={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "重复单位" }));

    const menu = screen.getByTestId("custom-repeat-unit-menu");
    expect(menu).toHaveClass("border", "shadow-[0_6px_12px_rgba(0,0,0,0.16)]");
    expect(menu.style.backgroundColor).toBe("var(--bg-primary)");
    expect(menu.style.borderColor).toBe("var(--border-color)");
  });
});
