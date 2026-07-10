import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { richPaneViewStateRegistry } from "../lib/editor-runtime";
import { RichPreviewCache } from "../lib/rich-preview-cache";
import { VirtualRichPreview } from "./virtual-rich-preview";

const virtualizerMock = vi.hoisted(() => ({
  measureElement: vi.fn(),
  options: null as {
    count: number;
    estimateSize: () => number;
    getScrollElement: () => Element | null;
    overscan: number;
  } | null,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: NonNullable<typeof virtualizerMock.options>) => {
    virtualizerMock.options = options;
    return {
      getTotalSize: () => options.count * 36,
      getVirtualItems: () =>
        [0, 1, 2].map((index) => ({
          index,
          key: index,
          size: 36,
          start: index * 36,
        })),
      measureElement: virtualizerMock.measureElement,
    };
  },
}));

function createCache() {
  const initialContent: PartialBlock[] = Array.from(
    { length: 100 },
    (_, index) => {
      const id = `block-${index}`;
      if (index === 0) {
        return {
          id,
          type: "heading",
          props: { level: 1 },
          content: "Heading A",
        };
      }
      if (index === 1) {
        return {
          id,
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", styles: {} },
            { type: "text", text: "world", styles: { bold: true } },
          ],
        };
      }
      return {
        id,
        type: "paragraph",
        content: index === 99 ? "raw markdown source" : `Rendered ${index}`,
      };
    },
  );
  const source = BlockNoteEditor.create({ initialContent });
  const cache = new RichPreviewCache(source);
  cache.seed(source.document);

  return { cache };
}

describe("VirtualRichPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    richPaneViewStateRegistry.clear();
    virtualizerMock.options = null;
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    vi.restoreAllMocks();
  });

  it("renders only bounded virtual blocks as a readonly rich textbox", () => {
    const { cache } = createCache();
    const { container } = render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={vi.fn()}
      />,
    );

    expect(
      container.querySelectorAll("[data-rich-preview-block]"),
    ).toHaveLength(3);
    expect(container).toHaveTextContent("Heading A");
    expect(container).not.toHaveTextContent("raw markdown source");
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-readonly",
      "true",
    );
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-multiline",
      "true",
    );
    expect(virtualizerMock.options).toMatchObject({ count: 100, overscan: 8 });
    expect(virtualizerMock.options?.estimateSize()).toBe(36);
    expect(virtualizerMock.options?.getScrollElement()).toBe(
      screen.getByRole("textbox"),
    );
  });

  it("patches only the current pane scroll position", () => {
    const { cache } = createCache();
    const patch = vi.spyOn(richPaneViewStateRegistry, "patch");
    render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={vi.fn()}
      />,
    );
    const preview = screen.getByRole("textbox");

    preview.scrollTop = 128;
    fireEvent.scroll(preview);

    expect(patch).toHaveBeenCalledOnce();
    expect(patch).toHaveBeenCalledWith("group-a:tab-a", {
      scrollTop: 128,
    });
  });

  it("activates the exact anchor from a nested text position", () => {
    const { cache } = createCache();
    const onActivate = vi.fn();
    const { container } = render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={onActivate}
      />,
    );
    const strong = container.querySelector("strong")!;
    const text = strong.firstChild!;
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: vi.fn(() => ({ offset: 3, offsetNode: text })),
    });

    fireEvent.pointerDown(text, { clientX: 20, clientY: 30 });

    expect(onActivate).toHaveBeenCalledWith({
      blockId: "block-1",
      textOffset: 9,
    });
  });

  it("keeps document and block subscriptions stable across parent renders", () => {
    const { cache } = createCache();
    const subscribe = vi.spyOn(cache, "subscribe");
    const subscribeBlock = vi.spyOn(cache, "subscribeBlock");
    const props = {
      cache,
      onActivate: vi.fn(),
      paneKey: "group-a:tab-a" as const,
    };
    const { rerender } = render(<VirtualRichPreview {...props} />);

    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribeBlock).toHaveBeenCalledTimes(3);
    rerender(<VirtualRichPreview {...props} />);

    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribeBlock).toHaveBeenCalledTimes(3);
  });
});
