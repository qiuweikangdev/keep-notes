import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FolderInput } from "lucide-react";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders a default alert icon when no semantic icon is supplied", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="确认操作"
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("heading", { name: "确认操作" })
        .querySelector("svg.lucide-circle-alert"),
    ).toBeInTheDocument();
  });

  it("uses a trash icon and destructive button for danger confirmations", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="确认删除"
        confirmText="删除"
        variant="danger"
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("heading", { name: "确认删除" })
        .querySelector('svg[class*="trash"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
  });

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

  it("uses a caller-supplied semantic icon", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="确认移动"
        icon={FolderInput}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("heading", { name: "确认移动" })
        .querySelector("svg.lucide-folder-input"),
    ).toBeInTheDocument();
  });
});
