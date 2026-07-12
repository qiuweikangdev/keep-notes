import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EditorStateView } from "./editor-state-view";

describe("EditorStateView", () => {
  it("renders a retry action for read errors", async () => {
    const retry = vi.fn();
    render(
      <EditorStateView
        status="error"
        fileName="broken.md"
        message="Access denied"
        onRetry={retry}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "重试加载" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
