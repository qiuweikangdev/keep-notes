import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OutlinePanel } from "./outline-panel";

describe("OutlinePanel", () => {
  it("starts the outline list from the top when headings change", async () => {
    const { container, rerender } = render(
      <OutlinePanel
        headings={[
          { id: "old-1", text: "Old heading", level: 1 },
          { id: "old-2", text: "Old details", level: 2 },
        ]}
        activeHeadingId={null}
        resetKey="old.md"
        onHeadingClick={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector(".overflow-auto");
    expect(scrollContainer).toBeInstanceOf(HTMLElement);
    if (!(scrollContainer instanceof HTMLElement)) return;

    scrollContainer.scrollTop = 180;
    rerender(
      <OutlinePanel
        headings={[
          { id: "new-1", text: "New heading", level: 1 },
          { id: "new-2", text: "New details", level: 2 },
        ]}
        activeHeadingId={null}
        resetKey="new.md"
        onHeadingClick={vi.fn()}
      />,
    );

    expect(screen.getByText("New heading")).toBeInTheDocument();
    await waitFor(() => expect(scrollContainer.scrollTop).toBe(0));
  });
});
