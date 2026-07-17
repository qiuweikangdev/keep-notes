import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("uses a warning icon for irreversible discard confirmations", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="确认放弃更改"
        description="确定要放弃当前文件的更改吗？"
        variant="warning"
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("heading", { name: "确认放弃更改" })
        .querySelector("svg.lucide-triangle-alert"),
    ).toBeInTheDocument();
  });
});
