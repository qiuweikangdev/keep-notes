import { afterEach, describe, expect, it, vi } from "vitest";

import {
  flushPendingEditorOutlineNavigation,
  registerEditorOutlineNavigator,
  scrollEditorOutlineBlock,
} from "./editor-outline-navigation";

describe("editor outline navigation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes outline jumps to the matching editor instance", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const unregisterFirst = registerEditorOutlineNavigator(
      "group-1",
      "tab-1",
      first,
    );
    const unregisterSecond = registerEditorOutlineNavigator(
      "group-2",
      "tab-2",
      second,
    );

    expect(scrollEditorOutlineBlock("group-2", "tab-2", "heading-1")).toBe(
      true,
    );

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("heading-1");

    unregisterFirst();
    unregisterSecond();
  });

  it("runs the latest pending outline jump when the editor registers", () => {
    expect(scrollEditorOutlineBlock("group-1", "tab-1", "heading-1")).toBe(
      false,
    );
    expect(scrollEditorOutlineBlock("group-1", "tab-1", "heading-2")).toBe(
      false,
    );

    const navigate = vi.fn(() => true);
    const unregister = registerEditorOutlineNavigator(
      "group-1",
      "tab-1",
      navigate,
    );

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("heading-2");

    unregister();
  });

  it("keeps a pending outline jump until the editor reports the block is ready", () => {
    const navigate = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const unregister = registerEditorOutlineNavigator(
      "group-1",
      "tab-1",
      navigate,
    );

    expect(scrollEditorOutlineBlock("group-1", "tab-1", "heading-1")).toBe(
      false,
    );
    expect(flushPendingEditorOutlineNavigation("group-1", "tab-1")).toBe(true);

    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenLastCalledWith("heading-1");

    unregister();
  });

  it("retries a pending outline jump after the navigator becomes ready", () => {
    vi.useFakeTimers();
    const navigate = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const unregister = registerEditorOutlineNavigator(
      "group-1",
      "tab-1",
      navigate,
    );

    expect(scrollEditorOutlineBlock("group-1", "tab-1", "heading-1")).toBe(
      false,
    );

    vi.runOnlyPendingTimers();

    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenLastCalledWith("heading-1");

    unregister();
  });

  it("keeps retrying long enough for large documents to render the target block", () => {
    vi.useFakeTimers();
    const navigate = vi.fn(() => navigate.mock.calls.length > 20);
    const unregister = registerEditorOutlineNavigator(
      "group-1",
      "tab-1",
      navigate,
    );

    expect(scrollEditorOutlineBlock("group-1", "tab-1", "heading-1")).toBe(
      false,
    );

    for (let frame = 0; frame < 20; frame += 1) {
      vi.runOnlyPendingTimers();
    }

    expect(navigate).toHaveBeenCalledTimes(21);
    expect(navigate).toHaveBeenLastCalledWith("heading-1");

    unregister();
  });
});
