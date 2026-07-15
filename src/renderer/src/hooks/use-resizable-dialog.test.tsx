import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DragResizeProvider } from "@/components/drag-resize-provider";
import { DialogResizeHandles } from "@/components/ui/dialog-resize-handles";
import { useResizableDialog } from "./use-resizable-dialog";

const NativePointerEvent = window.PointerEvent;

class TestPointerEvent extends MouseEvent {
  pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

beforeAll(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

afterAll(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: NativePointerEvent,
  });
});

function Harness({
  isOpen = true,
  minWidth = 100,
  minHeight = 80,
}: {
  isOpen?: boolean;
  minWidth?: number;
  minHeight?: number;
}) {
  const { contentRef, dragHandleProps, resizeHandleProps } = useResizableDialog(
    { isOpen, minWidth, minHeight },
  );

  return (
    <div ref={contentRef} data-testid="dialog">
      <div data-testid="drag-handle" {...dragHandleProps} />
      <DialogResizeHandles resizeHandleProps={resizeHandleProps} />
    </div>
  );
}

function renderHarness(isOpen = true, minWidth = 100, minHeight = 80) {
  return render(
    <DragResizeProvider debounceMs={0}>
      <Harness isOpen={isOpen} minWidth={minWidth} minHeight={minHeight} />
    </DragResizeProvider>,
  );
}

function mockRect(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 768,
  });
});

describe("useResizableDialog", () => {
  it("activates header dragging after the threshold", () => {
    renderHarness();
    const dialog = screen.getByTestId("dialog");
    const handle = screen.getByTestId("drag-handle");
    mockRect(dialog, { left: 100, top: 100, width: 400, height: 300 });

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 1,
      clientX: 110,
      clientY: 110,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 114,
      clientY: 114,
    });
    expect(dialog.style.left).toBe("");

    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 120,
      clientY: 120,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 140,
      clientY: 150,
    });
    expect(dialog.style.left).toBe("120px");
    expect(dialog.style.top).toBe("130px");
  });

  it("caps the configured minimum size to a small viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 320,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 240,
    });
    renderHarness(true, 480, 280);
    const dialog = screen.getByTestId("dialog");
    mockRect(dialog, { left: 16, top: 16, width: 288, height: 208 });

    const east = document.querySelector<HTMLElement>(
      '[data-dialog-resize-handle="e"]',
    )!;
    fireEvent.pointerDown(east, {
      button: 0,
      pointerId: 2,
      clientX: 304,
      clientY: 100,
    });
    fireEvent.pointerMove(east, {
      pointerId: 2,
      clientX: 100,
      clientY: 100,
    });

    expect(dialog.style.width).toBe("288px");
    expect(dialog.style.height).toBe("208px");
  });

  it.each([
    ["n", { width: "300px", height: "170px", left: "200px", top: "180px" }],
    ["s", { width: "300px", height: "230px", left: "200px", top: "150px" }],
    ["e", { width: "340px", height: "200px", left: "200px", top: "150px" }],
    ["w", { width: "260px", height: "200px", left: "240px", top: "150px" }],
    ["ne", { width: "340px", height: "170px", left: "200px", top: "180px" }],
    ["nw", { width: "260px", height: "170px", left: "240px", top: "180px" }],
    ["se", { width: "340px", height: "230px", left: "200px", top: "150px" }],
    ["sw", { width: "260px", height: "230px", left: "240px", top: "150px" }],
  ] as const)("resizes from the %s handle", (direction, expected) => {
    renderHarness();
    const dialog = screen.getByTestId("dialog");
    mockRect(dialog, { left: 200, top: 150, width: 300, height: 200 });
    const handle = document.querySelector<HTMLElement>(
      `[data-dialog-resize-handle="${direction}"]`,
    )!;

    fireEvent.pointerDown(handle, {
      button: 0,
      pointerId: 3,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerMove(handle, {
      pointerId: 3,
      clientX: 40,
      clientY: 30,
    });

    expect(dialog.style.width).toBe(expected.width);
    expect(dialog.style.height).toBe(expected.height);
    expect(dialog.style.left).toBe(expected.left);
    expect(dialog.style.top).toBe(expected.top);
  });

  it("re-clamps geometry after the viewport shrinks", () => {
    renderHarness();
    const dialog = screen.getByTestId("dialog");
    mockRect(dialog, { left: 100, top: 100, width: 700, height: 500 });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 600,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 400,
    });

    fireEvent(window, new Event("resize"));

    expect(dialog.style.width).toBe("568px");
    expect(dialog.style.height).toBe("368px");
    expect(dialog.style.left).toBe("16px");
    expect(dialog.style.top).toBe("16px");
  });

  it("clears inline geometry every time the dialog opens", () => {
    const { rerender } = renderHarness();
    const dialog = screen.getByTestId("dialog");
    dialog.style.width = "520px";
    dialog.style.left = "40px";

    rerender(
      <DragResizeProvider debounceMs={0}>
        <Harness isOpen={false} />
      </DragResizeProvider>,
    );
    rerender(
      <DragResizeProvider debounceMs={0}>
        <Harness isOpen />
      </DragResizeProvider>,
    );

    expect(screen.getByTestId("dialog").style.width).toBe("");
    expect(screen.getByTestId("dialog").style.left).toBe("");
  });
});
