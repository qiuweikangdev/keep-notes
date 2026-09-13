import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeSelector } from "./theme-selector";

describe("ThemeSelector", () => {
  it("uses a system icon and structural color previews", async () => {
    render(<ThemeSelector value="dark" onChange={vi.fn()} />);

    fireEvent.keyDown(
      screen.getByRole("button", { name: "选择主题，当前为深色" }),
      { key: "Enter" },
    );

    const systemPreview = (
      await screen.findByRole("menuitem", { name: "跟随系统" })
    ).querySelector('[data-theme-preview="system"]');
    expect(systemPreview?.querySelector("svg")).toHaveClass("lucide-monitor");

    for (const theme of ["light", "dark", "minimal"]) {
      const preview = screen
        .getByRole("menuitem", {
          name:
            theme === "light" ? "浅色" : theme === "dark" ? "深色" : "深黑色",
        })
        .querySelector(`[data-theme-preview="${theme}"]`);

      expect(preview?.querySelector("svg")).not.toBeInTheDocument();
      expect(
        preview?.querySelector('[data-theme-preview-accent="true"]'),
      ).toBeInTheDocument();
      expect(preview?.querySelector(".rounded-full.h-1.w-1")).toBeNull();
    }
  });
});
