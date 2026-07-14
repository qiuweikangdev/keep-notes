import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { BlockNoteEditor, type PartialBlock } from "@blocknote/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { richPaneViewStateRegistry } from "../lib/editor-runtime";
import { RichPreviewCache } from "../lib/rich-preview-cache";
import { useEditorStore } from "@/store/editor.store";
import { useUIStore } from "@/store/ui.store";
import { VirtualRichPreview } from "./virtual-rich-preview";

const virtualizerMock = vi.hoisted(() => ({
  measureElement: vi.fn(),
  scrollToIndex: vi.fn(),
  options: null as {
    count: number;
    estimateSize: () => number;
    getItemKey: (index: number) => number | string;
    getScrollElement: () => Element | null;
    overscan: number;
  } | null,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: NonNullable<typeof virtualizerMock.options>) => {
    virtualizerMock.options = options;
    let start = 0;
    const virtualItems = [0, 1, 2].map((index) => {
      const key = options.getItemKey(index);
      const size = key === "block-0" ? 48 : key === "block-1" ? 72 : 36;
      const item = { index, key, size, start };
      start += size;
      return item;
    });
    return {
      getTotalSize: () => start + Math.max(0, options.count - 3) * 36,
      getVirtualItems: () => virtualItems,
      measureElement: virtualizerMock.measureElement,
      scrollToIndex: virtualizerMock.scrollToIndex,
    };
  },
}));

function installColorSchemeMedia(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const addEventListener = vi.fn(
    (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
  );
  const removeEventListener = vi.fn(
    (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  );
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener,
    removeEventListener,
  } as MediaQueryList;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });

  return {
    addEventListener,
    removeEventListener,
    get listenerCount() {
      return listeners.size;
    },
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = { matches, media: mediaQuery.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

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

  return { cache, source };
}

describe("VirtualRichPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    installColorSchemeMedia();
    useUIStore.setState({ theme: "dark" });
    richPaneViewStateRegistry.clear();
    virtualizerMock.options = null;
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    Reflect.deleteProperty(document, "caretRangeFromPoint");
    Reflect.deleteProperty(window, "matchMedia");
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

    const mountedItems = container.querySelectorAll(
      "[data-rich-preview-block]",
    ).length;
    const mockedVisibleItems = 3;
    expect(mountedItems).toBe(mockedVisibleItems);
    expect(mountedItems).toBeLessThanOrEqual(mockedVisibleItems + 16);
    expect(container).toHaveTextContent("Heading A");
    expect(container).not.toHaveTextContent("raw markdown source");
    expect(screen.getByRole("textbox")).toHaveStyle({
      height: "100%",
      minHeight: "0",
      width: "100%",
    });
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-readonly",
      "true",
    );
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-multiline",
      "true",
    );
    expect(container.querySelector(".bn-editor-preview")).not.toBeNull();
    expect(container.querySelector(".bn-editor")).toBeNull();
    expect(virtualizerMock.options).toMatchObject({ count: 100, overscan: 4 });
    expect(virtualizerMock.options?.estimateSize()).toBe(64);
    expect(virtualizerMock.options?.getScrollElement()).toBe(
      screen.getByRole("textbox"),
    );
    expect(virtualizerMock.options?.getItemKey(0)).toBe("block-0");
  });

  it("keeps the virtual preview opaque at reduced window opacity", () => {
    const { cache } = createCache();
    const appearance = useEditorStore.getState().appearance;
    useEditorStore.setState({
      appearance: { ...appearance, opacity: 60 },
    });

    try {
      render(
        <VirtualRichPreview
          paneKey="group-a:tab-a"
          cache={cache}
          onActivate={vi.fn()}
        />,
      );

      expect(screen.getByRole("textbox").style.opacity).toBe("");
    } finally {
      useEditorStore.setState({ appearance });
    }
  });

  it("keeps virtual measurements and React instances keyed by block ID", () => {
    const { cache, source } = createCache();
    const props = {
      cache,
      onActivate: vi.fn(),
      paneKey: "group-a:tab-a" as const,
    };
    const { container, rerender } = render(<VirtualRichPreview {...props} />);
    const initialElements = new Map(
      ["block-0", "block-1", "block-2"].map((id) => [
        id,
        container.querySelector(`[data-block-id="${id}"]`),
      ]),
    );

    expect(initialElements.get("block-0")).toHaveStyle(
      "transform: translateY(0px)",
    );
    expect(initialElements.get("block-1")).toHaveStyle(
      "transform: translateY(48px)",
    );
    expect(virtualizerMock.measureElement).toHaveBeenCalledWith(
      initialElements.get("block-0"),
    );

    cache.seed([
      source.document[2],
      source.document[0],
      source.document[1],
      ...source.document.slice(3),
    ]);
    rerender(<VirtualRichPreview {...props} />);

    expect(virtualizerMock.options?.getItemKey(0)).toBe("block-2");
    expect(virtualizerMock.options?.getItemKey(1)).toBe("block-0");
    expect(virtualizerMock.options?.getItemKey(2)).toBe("block-1");
    expect(container.querySelector('[data-block-id="block-0"]')).toBe(
      initialElements.get("block-0"),
    );
    expect(container.querySelector('[data-block-id="block-1"]')).toBe(
      initialElements.get("block-1"),
    );
    expect(container.querySelector('[data-block-id="block-2"]')).toBe(
      initialElements.get("block-2"),
    );
    expect(container.querySelector('[data-block-id="block-0"]')).toHaveStyle(
      "transform: translateY(36px)",
    );
    expect(container.querySelector('[data-block-id="block-1"]')).toHaveStyle(
      "transform: translateY(84px)",
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

    fireEvent.wheel(preview);
    preview.scrollTop = 128;
    fireEvent.scroll(preview);

    expect(patch).toHaveBeenCalledOnce();
    expect(patch).toHaveBeenCalledWith(
      "group-a:tab-a",
      expect.objectContaining({ scrollTop: 128 }),
    );
  });

  it("does not write a restored scroll event over newer pane state", () => {
    const paneKey = "group-a:tab-a";
    richPaneViewStateRegistry.patch(paneKey, { scrollTop: 96 });
    const patch = vi.spyOn(richPaneViewStateRegistry, "patch");
    const { cache } = createCache();
    render(
      <VirtualRichPreview
        paneKey={paneKey}
        cache={cache}
        onActivate={vi.fn()}
      />,
    );
    const preview = screen.getByRole("textbox");

    expect(preview.scrollTop).toBe(96);
    richPaneViewStateRegistry.patch(paneKey, { scrollTop: 144 });
    patch.mockClear();
    fireEvent.scroll(preview);

    expect(patch).not.toHaveBeenCalled();
    expect(richPaneViewStateRegistry.read(paneKey).scrollTop).toBe(144);

    fireEvent.wheel(preview);
    preview.scrollTop = 180;
    fireEvent.scroll(preview);

    expect(patch).toHaveBeenCalledOnce();
    expect(patch).toHaveBeenCalledWith(
      paneKey,
      expect.objectContaining({ scrollTop: 180 }),
    );
  });

  it("keeps the hidden preview synchronized while its pane is live", () => {
    const paneKey = "group-a:tab-a";
    const { cache } = createCache();
    const props = {
      cache,
      onActivate: vi.fn(),
      paneKey: paneKey as const,
    };
    const { rerender } = render(
      <VirtualRichPreview {...props} isLive={true} />,
    );
    const preview = screen.getByRole("textbox");
    preview.scrollTop = 40;
    richPaneViewStateRegistry.patch(paneKey, { scrollTop: 420 });

    expect(preview.scrollTop).toBe(420);

    rerender(<VirtualRichPreview {...props} isLive={false} />);

    expect(preview.scrollTop).toBe(420);
    richPaneViewStateRegistry.patch(paneKey, { scrollTop: 560 });
    expect(preview.scrollTop).toBe(560);
  });

  it("ignores hidden preview scroll events while its pane is live", () => {
    const paneKey = "group-a:tab-a";
    const { cache } = createCache();
    richPaneViewStateRegistry.patch(paneKey, { scrollTop: 420 });
    const patch = vi.spyOn(richPaneViewStateRegistry, "patch");
    const { rerender } = render(
      <VirtualRichPreview
        paneKey={paneKey}
        cache={cache}
        isLive={true}
        onActivate={vi.fn()}
      />,
    );
    const preview = screen.getByRole("textbox");

    fireEvent.wheel(preview);
    preview.scrollTop = 40;
    fireEvent.scroll(preview);

    expect(patch).not.toHaveBeenCalled();
    expect(richPaneViewStateRegistry.read(paneKey).scrollTop).toBe(420);

    rerender(
      <VirtualRichPreview
        paneKey={paneKey}
        cache={cache}
        isLive={false}
        onActivate={vi.fn()}
      />,
    );
    expect(preview.scrollTop).toBe(420);
  });

  it("ignores virtualizer scroll corrections without user intent", () => {
    const paneKey = "group-a:tab-a";
    const patch = vi.spyOn(richPaneViewStateRegistry, "patch");
    const { cache } = createCache();
    render(
      <VirtualRichPreview
        paneKey={paneKey}
        cache={cache}
        onActivate={vi.fn()}
      />,
    );
    const preview = screen.getByRole("textbox");

    preview.scrollTop = 240;
    fireEvent.scroll(preview);

    expect(patch).not.toHaveBeenCalled();
    expect(richPaneViewStateRegistry.read(paneKey).scrollTop).toBe(0);
  });

  it("records the first visible block anchor instead of only a pixel offset", () => {
    const paneKey = "group-a:tab-a";
    const { cache } = createCache();
    render(
      <VirtualRichPreview
        paneKey={paneKey}
        cache={cache}
        onActivate={vi.fn()}
      />,
    );
    const preview = screen.getByRole("textbox");
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 0,
      right: 400,
      top: 100,
      width: 400,
      x: 0,
      y: 100,
      toJSON: vi.fn(),
    });
    const blocks = preview.querySelectorAll<HTMLElement>(
      "[data-rich-preview-block]",
    );
    vi.spyOn(blocks[0], "getBoundingClientRect").mockReturnValue({
      bottom: 80,
      height: 60,
      left: 0,
      right: 400,
      top: 20,
      width: 400,
      x: 0,
      y: 20,
      toJSON: vi.fn(),
    });
    vi.spyOn(blocks[1], "getBoundingClientRect").mockReturnValue({
      bottom: 150,
      height: 80,
      left: 0,
      right: 400,
      top: 70,
      width: 400,
      x: 0,
      y: 70,
      toJSON: vi.fn(),
    });

    fireEvent.wheel(preview);
    preview.scrollTop = 480;
    fireEvent.scroll(preview);

    expect(richPaneViewStateRegistry.read(paneKey)).toMatchObject({
      scrollTop: 480,
      topBlockId: "block-1",
      topBlockOffset: 30,
    });
  });

  it("pre-aligns a hidden preview from the live editor block anchor", () => {
    const paneKey = "group-a:tab-a";
    const { cache } = createCache();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const props = { cache, onActivate: vi.fn(), paneKey: paneKey as const };
    const { rerender } = render(
      <VirtualRichPreview {...props} isLive={true} />,
    );
    const preview = screen.getByRole("textbox");
    vi.spyOn(preview, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          bottom: 500,
          height: 400,
          left: 0,
          right: 400,
          top: 100,
          width: 400,
          x: 0,
          y: 100,
          toJSON: vi.fn(),
        }) as DOMRect,
    );
    const target = preview.querySelector<HTMLElement>(
      '[data-block-id="block-1"]',
    )!;
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          bottom: 440 - preview.scrollTop,
          height: 80,
          left: 0,
          right: 400,
          top: 360 - preview.scrollTop,
          width: 400,
          x: 0,
          y: 360 - preview.scrollTop,
          toJSON: vi.fn(),
        }) as DOMRect,
    );
    richPaneViewStateRegistry.patch(paneKey, {
      scrollTop: 900,
      topBlockId: "block-1",
      topBlockOffset: 30,
    });

    expect(virtualizerMock.scrollToIndex).not.toHaveBeenCalled();
    expect(preview.scrollTop).toBe(290);

    rerender(<VirtualRichPreview {...props} isLive={false} />);
    expect(preview.scrollTop).toBe(290);
  });

  it("cancels a stale deferred restore when a newer anchor is already mounted", () => {
    const paneKey = "group-a:tab-a";
    const { cache } = createCache();
    const scheduledFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    });
    render(
      <VirtualRichPreview
        paneKey={paneKey}
        cache={cache}
        onActivate={vi.fn()}
      />,
    );
    const preview = screen.getByRole("textbox");
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      bottom: 500,
      height: 400,
      left: 0,
      right: 400,
      top: 100,
      width: 400,
      x: 0,
      y: 100,
      toJSON: vi.fn(),
    });
    const mountedTarget = preview.querySelector<HTMLElement>(
      '[data-block-id="block-1"]',
    )!;
    vi.spyOn(mountedTarget, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          bottom: 440 - preview.scrollTop,
          height: 80,
          left: 0,
          right: 400,
          top: 360 - preview.scrollTop,
          width: 400,
          x: 0,
          y: 360 - preview.scrollTop,
          toJSON: vi.fn(),
        }) as DOMRect,
    );

    act(() => {
      richPaneViewStateRegistry.patch(paneKey, {
        scrollTop: 3600,
        topBlockId: "block-99",
        topBlockOffset: 0,
      });
    });
    const staleTarget = document.createElement("div");
    staleTarget.dataset.blockId = "block-99";
    staleTarget.dataset.richPreviewBlock = "";
    vi.spyOn(staleTarget, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          bottom: 680 - preview.scrollTop,
          height: 80,
          left: 0,
          right: 400,
          top: 600 - preview.scrollTop,
          width: 400,
          x: 0,
          y: 600 - preview.scrollTop,
          toJSON: vi.fn(),
        }) as DOMRect,
    );
    preview.append(staleTarget);

    act(() => {
      richPaneViewStateRegistry.patch(paneKey, {
        scrollTop: 900,
        topBlockId: "block-1",
        topBlockOffset: 30,
      });
    });
    expect(preview.scrollTop).toBe(290);

    act(() => scheduledFrames.shift()?.(0));

    expect(preview.scrollTop).toBe(290);
  });

  it("does not activate a pane when dragging its scrollbar", () => {
    const { cache } = createCache();
    const onActivate = vi.fn();
    render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={onActivate}
      />,
    );
    const preview = screen.getByRole("textbox");
    Object.defineProperties(preview, {
      clientWidth: { configurable: true, value: 180 },
      offsetWidth: { configurable: true, value: 200 },
    });
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      bottom: 300,
      height: 300,
      left: -180,
      right: 20,
      top: 0,
      width: 200,
      x: -180,
      y: 0,
      toJSON: vi.fn(),
    });

    const pointerDown = createEvent.pointerDown(preview);
    Object.defineProperties(pointerDown, {
      button: { configurable: true, value: 0 },
      clientX: { configurable: true, value: 10 },
      clientY: { configurable: true, value: 80 },
    });
    fireEvent(preview, pointerDown);

    expect(onActivate).not.toHaveBeenCalled();
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

    const dispatched = fireEvent.pointerDown(text, {
      clientX: 20,
      clientY: 30,
    });

    expect(dispatched).toBe(false);
    expect(onActivate).toHaveBeenCalledWith({
      blockId: "block-1",
      textOffset: 9,
    });
  });

  it("rejects a caret position returned from a neighboring block", () => {
    const { cache } = createCache();
    const onActivate = vi.fn();
    const { container } = render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={onActivate}
      />,
    );
    const target = container.querySelector('[data-block-id="block-0"] h1')!;
    const neighborText = container.querySelector("strong")!.firstChild!;
    Object.defineProperty(document, "caretPositionFromPoint", {
      configurable: true,
      value: vi.fn(() => ({ offset: 3, offsetNode: neighborText })),
    });

    fireEvent.pointerDown(target, { clientX: 20, clientY: 30 });

    expect(onActivate).toHaveBeenCalledWith({
      blockId: "block-0",
      textOffset: 0,
    });
  });

  it("rejects a caret range returned from a neighboring block", () => {
    const { cache } = createCache();
    const onActivate = vi.fn();
    const { container } = render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={onActivate}
      />,
    );
    const target = container.querySelector('[data-block-id="block-0"] h1')!;
    const neighborText = container.querySelector("strong")!.firstChild!;
    const range = document.createRange();
    range.setStart(neighborText, 3);
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: vi.fn(() => range),
    });

    fireEvent.pointerDown(target, { clientX: 20, clientY: 30 });

    expect(onActivate).toHaveBeenCalledWith({
      blockId: "block-0",
      textOffset: 0,
    });
  });

  it("uses an exact in-block caret range when position lookup is unavailable", () => {
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
    const range = document.createRange();
    range.setStart(text, 3);
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: vi.fn(() => range),
    });

    fireEvent.pointerDown(strong, { clientX: 20, clientY: 30 });

    expect(onActivate).toHaveBeenCalledWith({
      blockId: "block-1",
      textOffset: 9,
    });
  });

  it("reacts to system color-scheme changes while mounted", () => {
    const colorScheme = installColorSchemeMedia(false);
    useUIStore.setState({ theme: "system" });
    const { cache } = createCache();
    render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={vi.fn()}
      />,
    );
    const preview = screen.getByRole("textbox");

    expect(preview).toHaveAttribute("data-color-scheme", "light");
    act(() => colorScheme.setMatches(true));
    expect(preview).toHaveAttribute("data-color-scheme", "dark");
  });

  it("shares one readonly system-theme observer across preview instances", () => {
    const colorScheme = installColorSchemeMedia(false);
    useUIStore.setState({ theme: "system" });
    const { cache } = createCache();
    const localStorageSetItem = vi.spyOn(Storage.prototype, "setItem");
    const rootSetProperty = vi.spyOn(
      document.documentElement.style,
      "setProperty",
    );
    const rootClassAdd = vi.spyOn(document.documentElement.classList, "add");
    const bodyClassAdd = vi.spyOn(document.body.classList, "add");
    const globalThemeState = {
      bodyClass: document.body.className,
      bodyStyle: document.body.getAttribute("style"),
      rootClass: document.documentElement.className,
      rootDataTheme: document.documentElement.getAttribute("data-theme"),
      rootStyle: document.documentElement.getAttribute("style"),
    };
    const previews = (
      <>
        <VirtualRichPreview
          paneKey="group-a:tab-a"
          cache={cache}
          onActivate={vi.fn()}
        />
        <VirtualRichPreview
          paneKey="group-b:tab-b"
          cache={cache}
          onActivate={vi.fn()}
        />
        <VirtualRichPreview
          paneKey="group-c:tab-c"
          cache={cache}
          onActivate={vi.fn()}
        />
      </>
    );
    const { rerender, unmount } = render(previews);

    expect(colorScheme.addEventListener).toHaveBeenCalledOnce();
    expect(colorScheme.listenerCount).toBe(1);
    expect(localStorageSetItem).not.toHaveBeenCalled();
    expect(rootSetProperty).not.toHaveBeenCalled();
    expect(rootClassAdd).not.toHaveBeenCalled();
    expect(bodyClassAdd).not.toHaveBeenCalled();
    expect({
      bodyClass: document.body.className,
      bodyStyle: document.body.getAttribute("style"),
      rootClass: document.documentElement.className,
      rootDataTheme: document.documentElement.getAttribute("data-theme"),
      rootStyle: document.documentElement.getAttribute("style"),
    }).toEqual(globalThemeState);
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
    expect(
      screen
        .getAllByRole("textbox")
        .every((preview) => preview.dataset.colorScheme === "light"),
    ).toBe(true);

    rerender(previews);
    expect(colorScheme.addEventListener).toHaveBeenCalledOnce();
    act(() => colorScheme.setMatches(true));
    expect(
      screen
        .getAllByRole("textbox")
        .every((preview) => preview.dataset.colorScheme === "dark"),
    ).toBe(true);
    expect(localStorageSetItem).not.toHaveBeenCalled();
    expect(rootSetProperty).not.toHaveBeenCalled();
    expect(rootClassAdd).not.toHaveBeenCalled();
    expect(bodyClassAdd).not.toHaveBeenCalled();

    unmount();
    expect(colorScheme.removeEventListener).toHaveBeenCalledOnce();
    expect(colorScheme.listenerCount).toBe(0);

    const replacementColorScheme = installColorSchemeMedia(true);
    const remounted = render(
      <VirtualRichPreview
        paneKey="group-d:tab-d"
        cache={cache}
        onActivate={vi.fn()}
      />,
    );
    expect(replacementColorScheme.addEventListener).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-color-scheme",
      "dark",
    );
    remounted.unmount();
    expect(replacementColorScheme.removeEventListener).toHaveBeenCalledOnce();
  });

  it("uses an SSR-safe light fallback when matchMedia is unavailable", () => {
    Reflect.deleteProperty(window, "matchMedia");
    useUIStore.setState({ theme: "system" });
    const { cache } = createCache();

    expect(() =>
      render(
        <VirtualRichPreview
          paneKey="group-a:tab-a"
          cache={cache}
          onActivate={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "data-color-scheme",
      "light",
    );
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
    const getItemKey = virtualizerMock.options?.getItemKey;

    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribeBlock).toHaveBeenCalledTimes(3);
    rerender(<VirtualRichPreview {...props} />);

    expect(subscribe).toHaveBeenCalledOnce();
    expect(subscribeBlock).toHaveBeenCalledTimes(3);
    expect(virtualizerMock.options?.getItemKey).toBe(getItemKey);
  });
});
