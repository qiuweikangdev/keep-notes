import { describe, expect, it, vi } from "vitest";

import {
  registerEditorOutlineNavigator,
  scrollEditorOutlineBlock,
} from "./editor-outline-navigation";

describe("editor outline navigation", () => {
  it("routes outline jumps to the matching editor instance", () => {
    const first = vi.fn();
    const second = vi.fn();
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
});
