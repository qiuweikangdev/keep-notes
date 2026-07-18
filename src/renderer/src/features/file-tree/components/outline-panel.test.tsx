import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OutlinePanel } from "./outline-panel";

describe("OutlinePanel", () => {
  it("uses the same hover scrollbar structure as the file tree", () => {
    const { container } = render(
      <OutlinePanel
        headings={[{ id: "heading-1", text: "Heading", level: 1 }]}
        activeHeadingId={null}
        resetKey="note.md"
        onHeadingClick={vi.fn()}
      />,
    );

    expect(container.querySelector(".file-tree-scroll-shell")).toBeVisible();
    expect(
      container.querySelector(".file-tree-scroll-container"),
    ).toBeVisible();
    expect(container.querySelector(".file-tree-scrollbar-track")).toBeVisible();
    expect(
      container.querySelector(".file-tree-scrollbar-thumb"),
    ).toBeInTheDocument();
  });

  it("scrolls the outline when clicking the custom scrollbar track", () => {
    const { container } = render(
      <OutlinePanel
        headings={[{ id: "heading-1", text: "Heading", level: 1 }]}
        activeHeadingId={null}
        resetKey="note.md"
        onHeadingClick={vi.fn()}
      />,
    );
    const scrollContainer = container.querySelector(
      ".file-tree-scroll-container",
    ) as HTMLDivElement;
    const scrollbarTrack = container.querySelector(
      ".file-tree-scrollbar-track",
    ) as HTMLDivElement;

    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    vi.spyOn(scrollbarTrack, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 8,
      top: 0,
      width: 8,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const pointerDown = createEvent.pointerDown(scrollbarTrack);
    Object.defineProperty(pointerDown, "clientY", {
      configurable: true,
      value: 50,
    });
    fireEvent(scrollbarTrack, pointerDown);

    expect(scrollContainer.scrollTop).toBe(450);
  });

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
    const scrollContainer = container.querySelector(
      ".file-tree-scroll-container",
    );
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
