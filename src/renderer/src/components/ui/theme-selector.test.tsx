import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeSelector } from "./theme-selector";

describe("ThemeSelector", () => {
  it("uses a system icon instead of duplicating a color preview", async () => {
    render(<ThemeSelector value="dark" onChange={vi.fn()} />);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "选择主题，当前为深色" }),
      { key: "Enter" },
    );

    const systemPreview = (
      await screen.findByRole("menuitem", { name: "跟随系统" })
    ).querySelector('[data-theme-preview="system"]');
    const darkPreview = screen
      .getByRole("menuitem", { name: "深色" })
      .querySelector('[data-theme-preview="dark"]');

    expect(systemPreview?.querySelector("svg")).toHaveClass("lucide-monitor");
    expect(darkPreview?.querySelector("svg")).not.toBeInTheDocument();
  });
});
