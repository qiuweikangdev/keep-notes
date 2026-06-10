import { fireEvent, render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { useDraggableDialog } from "./use-draggable-dialog";

function DraggableDialogHarness() {
  const { contentRef, dragHandleProps } = useDraggableDialog();

  return (
    <div
      ref={contentRef}
      data-testid="dialog"
      style={{ transform: "translate(-50%, -50%)" }}
    >
      <div data-testid="handle" {...dragHandleProps}>
        标题
      </div>
    </div>
  );
}

describe("useDraggableDialog", () => {
  beforeAll(() => {
    window.PointerEvent = MouseEvent as typeof PointerEvent;
  });

  it("moves the dialog from its title handle", () => {
    const view = render(<DraggableDialogHarness />);
    const dialog = view.container.querySelector<HTMLElement>(
      '[data-testid="dialog"]',
    )!;
    const handle = view.container.querySelector<HTMLElement>(
      '[data-testid="handle"]',
    )!;

    dialog.getBoundingClientRect = () =>
      ({
        left: 200,
        right: 800,
        top: 100,
        bottom: 600,
        width: 600,
        height: 500,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 400,
      clientY: 200,
      pointerId: 1,
    });
    fireEvent.pointerMove(handle, {
      clientX: 460,
      clientY: 240,
      pointerId: 1,
    });

    expect(dialog.style.transform).toBe(
      "translate(calc(-50% + 60px), calc(-50% + 40px))",
    );
  });

  it("keeps the dialog inside the viewport", () => {
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1000 },
      innerHeight: { configurable: true, value: 700 },
    });
    const view = render(<DraggableDialogHarness />);
    const dialog = view.container.querySelector<HTMLElement>(
      '[data-testid="dialog"]',
    )!;
    const handle = view.container.querySelector<HTMLElement>(
      '[data-testid="handle"]',
    )!;

    dialog.getBoundingClientRect = () =>
      ({
        left: 200,
        right: 800,
        top: 100,
        bottom: 600,
        width: 600,
        height: 500,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 400,
      clientY: 200,
      pointerId: 2,
    });
    fireEvent.pointerMove(handle, {
      clientX: 1400,
      clientY: 1200,
      pointerId: 2,
    });

    expect(dialog.style.transform).toBe(
      "translate(calc(-50% + 200px), calc(-50% + 100px))",
    );
  });
});
